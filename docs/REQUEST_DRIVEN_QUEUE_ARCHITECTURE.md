# Request-Driven Queue Architecture Proposal

**Status:** Proposal for review; no implementation changes are included here  
**Scope:** Remove the requirement for two continuously running queue consumers when deploying the app with Vercel, Neon, and Render, while keeping queued work durable and honest to the learner.

## Executive summary

The app can be deployed with its current workers on paid Render services. An architecture change is only needed if the goal is to avoid continuously running background-worker services or to make provider synchronization and learner-memory processing happen in response to an active learner session.

Today, the system stores jobs in PostgreSQL and runs two separate Node processes that poll for jobs every second. Render does not offer free background-worker compute, and its free web-service hours are shared across the workspace. The product direction described by the owner is to do this work in response to learner activity rather than as independent, recurring background work.

This proposal keeps PostgreSQL as the durable queue, removes the two always-polling worker services, and introduces a **request-driven job pump**. While a learner is actively using the site, the web client asks the Express API to process a small, bounded amount of due work. The installed browser connector is a separate active client: it can continue its own provider reads and uploads while the browser is running, even when the AlgoMemtor tab is closed. Connector-originated server jobs therefore need a trusted wake-up path too. Express claims work using the existing leases, processes it with the existing domain services, records completion or retry state, and returns job status. When neither the site nor connector is active, ordinary queued work waits until a later active event.

Provider sync must also stop creating hourly future jobs. The current `ProviderSyncWorker` schedules another linked-user sync one hour after a successful sync. The proposed policy removes that recurring schedule and queues provider sync only for explicit, consented product events such as first linking, a learner-initiated refresh, or a clearly defined active-session refresh rule.

This is a trade-off: it removes always-on queue consumers, but it changes the freshness and completion guarantees. User-facing status must say that work is pending until it actually completes. Learner deletion and other privacy-critical cleanup must not be left waiting indefinitely for the learner to return.

## Why consider this change

### Current deployment cost and behavior

The production Compose file defines these four application processes:

1. `core-api` — Express API.
2. `ai-api` — FastAPI AI service.
3. `memory-worker` — consumes the PostgreSQL memory outbox.
4. `provider-worker` — consumes PostgreSQL provider-sync jobs.

The two worker entry points call `processOnce()` immediately and then every second:

- `apps/core-api/src/memory-worker.ts` — `runMemoryWorker()`.
- `apps/core-api/src/provider-sync-worker.ts` — process startup interval.

Render documents that background workers have no free compute plan. Its free web services sleep after 15 minutes without inbound traffic, and the 750 free instance hours are shared across the workspace. Therefore, a free deployment cannot keep this topology continuously processing jobs. It can still run free web services for a demo, with sleep/wake delays, but the current worker service types need paid compute. See [Render free instance limits](https://render.com/docs/free) and [Render background workers](https://render.com/docs/background-workers).

This is a hosting constraint, not a correctness requirement of PostgreSQL. PostgreSQL can continue storing durable jobs while a worker is temporarily absent. The architecture decision is about **when and where jobs are claimed and executed**.

### Product behavior requested

The intended behavior is:

- Memory work follows learner activity in the product; it is not an independent scheduled check-in system.
- Provider account work follows learner activity and product actions; it should not silently run on an hourly timer while the learner is away.
- The browser connector remains installed and performs its own browser-side sync schedule; it is not one of the two server queue workers.
- The site should be deployable without two dedicated always-on worker services if the resulting delay and reliability behavior is acceptable.

The repository source already retires coach check-in processing: `apps/core-api/src/memory-worker.ts` completes old `coach_check_in_refresh` jobs without doing work. Some deployment and roadmap comments still describe check-ins and hourly provider sync, so those comments need reconciliation as part of implementation.

## Current queue design in this checkout

### Memory/outbox queue

The memory worker claims rows through `ProgressRepository.claimNextJob()` and processes one row per `processOnce()` call. Job handling in `apps/core-api/src/memory-worker.ts` includes memory generation and cleanup/deletion cases. It calls FastAPI for memory-related work and uses the core repositories to load evidence. The job is completed, retried with a delay, or marked failed.

Enqueue points include coach turns, provider activity changes, progress/recommendation changes, and deletion flows. Examples are in:

- `apps/core-api/src/services/coach-service.ts`
- `apps/core-api/src/services/learner-activity-service.ts`
- `apps/core-api/src/services/progress-service.ts`
- `apps/core-api/src/services/recommendation-service.ts`
- `apps/core-api/src/app.ts`

The queue is durable in PostgreSQL; it is not an in-memory-only queue. Its records include status, attempts, retry time, lock time, and a safe error code in `apps/core-api/src/repositories/progress-repository.ts`.

### Provider-sync queue

`ProviderSyncService` queues an `initial_sync` after linking and a `manual_sync` after a learner refresh request. Jobs are persisted by `PrismaProviderSyncRepository` in `core.provider_sync_jobs` and include run-after time, attempts, cursor, lease, and idempotency data.

The provider worker claims a due job, updates status, runs provider adapters, stores results, advances a cursor safely, retries eligible failures, and updates sync status. On successful sync, `ProviderSyncWorker.scheduleNextRun()` currently enqueues a `linked_user_sync` for one hour later, with jitter, when sync remains enabled. This is the current source behavior even though the desired deployment behavior is user-activity-triggered sync.

Relevant files:

- `apps/core-api/src/services/provider-sync-service.ts`
- `apps/core-api/src/services/provider-sync-worker.ts`
- `apps/core-api/src/repositories/provider-sync-repository.ts`
- `apps/core-api/src/provider-sync-worker.ts`

### Existing safety properties to preserve

- PostgreSQL persistence, rather than process memory, is the source of truth for queued work.
- Jobs use idempotency keys to avoid duplicate side effects.
- Provider work uses leases to prevent two consumers from processing the same job at once.
- Retryable provider failures are retried after a delay; permanent/unsafe failures are not blindly retried.
- Provider cursors are preserved so interrupted history syncs can resume without skipping unstored activity.
- Learner ownership and provider consent are checked by the API/domain services.
- Sync status distinguishes queued, running, partial, complete, stale, and failed outcomes.
- AI calls and provider fetches remain server-side; the browser does not receive provider secrets or call providers directly.

## Proposed target: request-driven job pump

### Overview

Keep the PostgreSQL job tables and the existing job processors, but stop continuously polling them from separate services. Let active, authenticated app usage request bounded queue progress through Express.

```text
Learner action or active-session refresh
  -> Express validates identity, ownership, consent, cooldown, and input
  -> Express writes a durable job to PostgreSQL
  -> active web client asks Express to make bounded queue progress
  -> Express claims due work with a database lease
  -> existing provider/memory processor performs the job
  -> PostgreSQL records completion, retry, or failure
  -> client refreshes the existing job/sync status
```

The browser is a **wake-up signal**, not a job executor. It must never receive database access, provider credentials, internal service tokens, or permission to choose arbitrary job IDs/users. Express continues to authenticate the learner and controls which queued work is eligible.

### Active-session definition

“Active” should have an explicit contract rather than being inferred from any background browser tab. A reasonable initial rule is:

- The learner has an authenticated app session and an open, visible page.
- The client sends a bounded pump request after an enqueue-producing action and while a job status is visibly pending.
- The client stops pumping when the page is hidden, the session expires, or no work is pending.
- A small cooldown prevents excessive pump traffic from multiple tabs.

If the team instead wants a provider refresh on each visit, define the page-load trigger, per-provider freshness threshold, consent check, and cooldown. Do not fetch provider data on every render or every API request.

### Browser connector is a separate client

The browser connector lives in `apps/browser-extension`; it reads the learner's own signed-in LeetCode/CSES browser data and uploads normalized records to the API. Its documented lifecycle includes sync when paired, when the extension/browser starts (subject to its recent-run guard), and on its configured interval. It does not require the AlgoMemtor site tab to remain open, though the browser itself must be running for browser-side scheduled work.

The extension's provider responsibilities differ:

- For LeetCode and CSES, the extension reads provider data in the learner's browser and sends it to `/api/connector/ingest`.
- For Codeforces and CodeChef, it reads the signed-in handle and calls `/api/connector/claim`; Express then queues server-side provider sync work.
- Connector tokens are intentionally restricted to connector routes. Do not give a connector token access to a generic global queue-pump endpoint.

Therefore “leave the site” should mean **the website stops sending web-session pump requests**, not “all syncing stops.” The extension may keep reading and uploading while the browser is active. In the request-driven design, connector ingestion/claim requests must safely wake only eligible jobs for that learner, or the server must explicitly leave those jobs queued until the next authenticated site session. This choice affects how fresh Codeforces/CodeChef data appears when the user closes the site tab but leaves the browser/extension running.

### API shape

Add an authenticated endpoint owned by Express for the website session, for example:

```http
POST /api/jobs/pump
Authorization: Bearer <Supabase access token>
Content-Type: application/json

{ "budgetMs": 1500 }
```

The server should clamp the budget to a small, configured maximum and return only a compact result, for example:

```json
{
  "data": {
    "processed": 1,
    "remainingDue": true,
    "nextPollAfterMs": 1000
  }
}
```

This is a design sketch, not a committed API contract. The implementation must use the shared Zod contracts and central API client. Do not expose an endpoint that allows the client to choose an owner ID, provider account ID, job type, or arbitrary job identifier. The connector must not call this generic endpoint with its restricted token. Instead, trusted connector routes such as `connector/claim` and `connector/ingest` may trigger a server-side, owner-scoped bounded drain after their own validation and enqueue/commit succeeds.

### Queue ownership and fairness

The existing claim methods are designed for a worker process, and provider jobs are claimed globally. Before exposing a browser-triggered pump, implement one of these safe server-side models:

1. **Authenticated-user-scoped claim:** pump only due jobs owned by the authenticated learner. This is the clearest fit for active-session work, but some global catalog/contest refresh work may not be learner-scoped and must be routed elsewhere.
2. **Trusted global bounded claim:** Express claims the next global job, with database leasing, strict request rate limits, and no user-controlled job selectors. This is simpler but needs fairness controls so one learner's requests do not monopolize processing or expose job status belonging to another learner.

Do not let a client repeatedly drain the global queue without authentication, quotas, and ownership-safe responses. Add per-user pump throttling, max jobs/time per request, concurrency limits, and a process-level single-flight guard. Database leases remain necessary because several app instances or browser tabs can request a pump concurrently.

### Job classes and target triggers

| Work | Current behavior | Proposed trigger | Important behavior |
| --- | --- | --- | --- |
| Initial provider sync | Link queues a durable job | Immediately after successful link, while the learner is in the active session | Keep consent checks, idempotency, cursor, and visible sync status. |
| Manual provider refresh | API queues job with 15-minute cooldown | Learner explicitly chooses refresh; active client pumps until complete or leaves | Keep `202 Accepted`/job status semantics; do not block the request for a full history fetch. |
| Recurring linked-provider sync | Successful job schedules another run about hourly | Remove automatic recurrence; optionally enqueue on active session only when data is older than an agreed freshness threshold | Preserve consent and provider request gates; show cached/stale state if the learner is not active. |
| Backfill continuation | Worker can enqueue continuation after rate/budget limits | Continue only while the learner remains active; otherwise persist the continuation and resume on next active session | Preserve cursor and idempotency; show incomplete/partial status honestly. |
| Learner-memory generation | Outbox job created by relevant learner/product events | Pump after the triggering action and during active-session pending work | Memory generation can be eventually consistent; do not claim memory updated until completed. |
| Coach conversation audit deletion | Outbox job calls the AI service for deletion | Run inline in deletion flow or prioritize through a reliable deletion path | Do not defer privacy cleanup indefinitely. |
| Learner data deletion | Durable deletion job | Complete as a deletion workflow with explicit status and retry path; see critical exception below | Do not report deletion complete while owned data/audits remain. |
| Problem data deletion | Outbox job | Process with the originating delete operation or pump promptly | Keep provider/problem ownership checks and idempotency. |
| Retired check-in jobs | Old rows may still exist | Complete as no-op during migration/cleanup | Check-ins are retired; do not recreate them. |
| Global catalog/contest refresh | Separate provider maintenance behavior may exist | Keep on an independent scheduled mechanism if required, or use provider cache TTL/lazy refresh | These jobs have no active learner owner, so a learner-scoped pump cannot be their only trigger. |

For extension-driven flows, `connector/ingest` must remain responsive and return its existing accepted/processed result. If it creates outbox work, it can request a bounded server-side drain only after the ingest transaction commits. `connector/claim` can do the same for the linked public provider's queued initial/manual sync. Any work left after the bounded drain stays durable; the extension must not be told that server sync completed merely because browser data was uploaded or a queue row was accepted.

The intended product rule is **no hidden hourly refresh while the learner is away**. If that rule changes, document the freshness/cost reason and get an explicit product decision before retaining recurring jobs.

## Critical exception: privacy and deletion work

“Wait until the next active session” is acceptable for some freshness and memory work, but is not an acceptable deletion guarantee by itself. A learner may delete an account and never return.

Choose one reliable deletion design before removing always-on workers:

### Preferred for this scope: synchronous bounded deletion

- The delete request marks deletion as pending and prevents normal learner actions immediately.
- Express deletes the learner's core-schema rows in a transaction or an idempotent ordered sequence.
- Express calls the AI API's protected deletion operation with a strict timeout and idempotency key.
- Only mark deletion complete after both core and AI-owned data have been removed; otherwise report pending/failed and provide a safe retry path.
- Never log prompts, tokens, provider handles, or raw AI deletion responses.

If the AI API or database operation cannot complete within the request/runtime limits, retain a durable deletion job and provide a small paid worker or scheduled retry mechanism. Do not quietly make deletion depend on browser activity.

The exact existing deletion workflow should be traced before implementation. The memory worker currently handles `learner_data_deletion`, `problem_data_deletion`, and `coach_conversation_audit_deletion`; these paths need dedicated reliability tests if processing moves.

## Alternatives considered

### A. Keep the current two workers on paid Render compute

**Advantages:** smallest code change; existing leases, retry loops, and scheduling model remain intact; queued work progresses even when no learner is browsing.  
**Costs:** two additional continuously running services; recurring provider sync continues unless separately changed; not a free Render deployment.

Use this if reliability and background freshness matter more than minimizing hosting cost.

### B. Request-driven pump in the Express API (recommended proposal)

**Advantages:** no dedicated always-polling worker service; work aligns with active user sessions; durable jobs can wait in Neon until a learner returns; existing job/status model can mostly remain.  
**Costs:** jobs can be delayed while nobody is active; requires secure pump API, frontend wake-up/poll logic, fairness, and careful treatment of long jobs/deletions; Render free API sleep still creates cold starts and is unsuitable for consistently responsive production.

Use this if the explicit product choice is that sync and memory work only need to progress while learners are using the app.

### C. Scheduled cron consumer

Run jobs periodically from a cron service rather than continuously polling. This can reduce idle runtime, but Render cron jobs require a supported paid plan and work still executes when no learner is active. It is useful for global cache refreshes or cleanup, not a direct match for a strictly user-active policy.

### D. Process jobs inline inside the learner action request

This is unsuitable for long provider history imports and AI calls: it can increase response latency, hit request timeouts, and turn a recoverable `202 Accepted` workflow into a fragile request. Keep enqueue/status semantics and execute bounded work separately from the action response.

## Required implementation changes

### 1. Confirm product and operational decisions

- Confirm whether automatic hourly linked-account sync is removed.
- Define which user actions/active-session events enqueue or wake provider sync.
- Define freshness thresholds per provider and consent requirements.
- Define whether memory is allowed to remain pending until the learner returns.
- Decide and document the reliable deletion exception.
- Define acceptable maximum delay for each job class and maximum pump interval/work budget.

### 2. Separate queue processing from process startup

- Extract dependency construction and `processOnce()` runners so the same processor can be called from a request-driven coordinator.
- Remove the unconditional one-second `setInterval()` startup loops from `memory-worker.ts` and `provider-sync-worker.ts` once the replacement is fully wired.
- Preserve graceful shutdown and Prisma connection reuse in the Express process.
- Ensure only one process-local pump runs at a time; continue to rely on database leases across replicas.
- Avoid making database clients per pump request.

### 3. Add the bounded Express pump

- Add a service that claims and processes due jobs for a bounded budget.
- Authenticate every request with the existing Supabase JWT middleware.
- Scope claims and responses to the authenticated learner where possible; never trust a client-supplied owner ID.
- Enforce request/body schema, rate limits, concurrency, max work per call, and safe error responses.
- Return compact processing metadata without exposing other learners' job contents or identifiers.
- Add observability for queue age, jobs claimed/completed/retried/failed, pump duration, and oldest pending deletion—without logging private payloads.

### 4. Connect the active web session

- After successful enqueue actions, notify the app-level queue pump.
- Keep the extension's own pairing/start/interval sync behavior unless separately changed by product decision. After validated connector ingest/claim actions, let Express invoke the same bounded coordinator internally for the authenticated connector owner; do not broaden connector-token route permissions.
- While the page is visible and authenticated, call the pump at a bounded interval only when the server reports due work or the UI has a pending job.
- Continue using existing sync-status endpoints to display progress; the pump response must not replace domain-specific job status.
- Stop pumping on hidden page, logout, expired session, or no pending work.
- Support multiple tabs without rapid duplicate requests; server-side controls are still required.
- Make cold-start and pending states understandable; do not display “complete” based solely on enqueue acceptance.

### 5. Change provider scheduling semantics

- Remove `scheduleNextRun()`'s automatic hourly enqueue from `apps/core-api/src/services/provider-sync-worker.ts`.
- Keep initial sync after linking and manual refresh with its current cooldown.
- If visit-driven refresh is desired, make it a separate explicit policy: evaluate staleness, consent, provider capabilities, and cooldown before enqueueing at most one job per provider/account.
- Define what happens to existing future `linked_user_sync` rows during rollout: drain them once, cancel them, or convert them to user-triggered jobs. Do not strand them as permanently queued records.
- Preserve backfill continuation and retry behavior, but resume only under the chosen active-session rule.

### 6. Handle memory and deletion work safely

- Keep current memory job idempotency, consent policy, evidence sanitization, retry delays, and per-user deletion guards.
- Do not process `coach_check_in_refresh` as real work; it is retired.
- Move core and AI deletion to the reliable deletion path, or keep a paid/scheduled deletion consumer.
- Add a visible/pollable deletion status that does not falsely report success.
- Decide whether failed memory-generation jobs remain retryable at the next active session or transition to a surfaced terminal failure.

### 7. Update deployment and docs

- Remove `memory-worker` and `provider-worker` from `docker-compose.prod.yml` only after the request-driven processing path is deployed and verified.
- Update Render deployment instructions and environment variables for the API process; remove worker-only service commands only if no other environment uses them.
- Update `docs/PROJECT_DOCUMENTATION.md` sections that still say hourly sync and check-ins are active, including the feature status table, continuation handoff, local service table, and production Docker table.
- Update README deployment steps and state that pending jobs pause while no learner session is active.
- Keep one-shot database migrations separate; Neon remains the persistent PostgreSQL host and is not the job runner.
- Keep Vercel-to-Render `/api/*` routing and domain/CORS/Supabase callback setup independent of queue processing.

### 8. Migration and rollout

1. Ship the pump endpoint and frontend pump while the existing workers still run.
2. Verify lease contention is safe when both the old consumers and API pump compete for jobs.
3. Observe job age, failure/retry behavior, provider rate-limit behavior, and deletion completion.
4. Remove automatic hourly provider scheduling if the product decision is confirmed; clean up or migrate already scheduled rows.
5. Move deletion to a reliable synchronous or retained-worker path.
6. Disable one dedicated worker at a time and confirm no queue types stop progressing.
7. Remove worker service definitions from the target deployment and update canonical docs only after acceptance passes.

Do not remove both workers before the replacement is deployed; that would leave durable jobs queued indefinitely.

## Verification and acceptance criteria

### Queue correctness

- A newly linked provider queues and processes the initial sync during an active session.
- Manual refresh preserves its cooldown, idempotency, consent, cursor, retry, partial, and status behavior.
- Two tabs/instances cannot process one leased job concurrently or corrupt its cursor.
- A process restart during work leaves the job recoverable after its lease expires.
- A long backfill can stop when the session ends and resumes from the stored cursor on a later active session.
- Closing the AlgoMemtor tab stops web-client pumping, but does not disable the installed extension; extension sync continues while its browser is running and follows its own schedule.
- A connector-originated `/api/connector/claim` queues eligible Codeforces/CodeChef server work and can wake only that connector owner's work through a server-side path; it cannot claim arbitrary learners' jobs.
- A connector `/api/connector/ingest` upload is not mislabeled as completion of any separate server-side provider or memory job it triggered.
- Memory jobs are not reported complete until the AI operation and persistence path succeed.
- No automatic hourly linked-user job is created under the user-active policy.
- Global catalog/contest refreshes have an explicit plan and do not accidentally depend on a learner-specific queue pump.
- Retired check-in jobs remain harmless no-ops.

### Security and privacy

- Unauthenticated pump requests fail with the established `401` behavior.
- A learner cannot select, read, or pump another learner's work by changing request data.
- Pump rate and work budgets are enforced server-side.
- Provider and AI secrets remain server-side; no provider calls originate from React.
- Deletion does not report success until core and AI-owned data are deleted; retries are safe and auditable without sensitive payload logs.

### Deployment and user experience

- Frontend receives `202 Accepted` for queued sync work and shows queued/running/partial/failed/completed states truthfully.
- Browser-extension install, pairing, local provider reads, uploads, and disconnect/revocation continue to work independently of whether the website tab is open.
- No dedicated Render background-worker service is required for the approved job classes—or any intentionally retained exception is documented and budgeted.
- When no learner is active, non-critical queued work stays durable and the UI describes data freshness accurately on the next visit.
- Render cold starts, Neon scale-to-zero, and request timeout behavior are measured in the deployed environment.
- Vercel frontend, Render API/AI services, Neon PostgreSQL/pgvector, Supabase auth, and OpenRouter are validated together; local tests alone are not deployment proof.

### Tests to add/update when implementing

- Unit tests for the request-driven coordinator: time budget, max jobs, no-work response, retry, and single-flight behavior.
- Repository integration tests for owner-scoped claiming and concurrent leases.
- API tests for JWT rejection, owner isolation, rate limiting, bounded payload validation, and stable errors.
- Provider sync tests proving no future hourly job is enqueued under the new policy.
- Frontend tests for visibility-aware pump lifecycle, pending-status polling, logout, and multiple tabs.
- Failure-injection tests for restart/lease expiry, Neon connection errors, FastAPI timeout, provider rate limits, and deletion retries.
- Render deployment smoke test with Vercel-origin requests, production Supabase JWTs, Neon migrations, and pgvector enabled.

## Recommendation

Proceed with the request-driven pump only if the product accepts that ordinary memory and provider work may wait until the next active session. Keep the database-backed queue and its correctness safeguards; change the consumer trigger and recurring-sync policy, not the fact that jobs are durable.

Do not make account deletion depend on a learner revisiting the site. Make deletion synchronous with an explicit retry/status contract, or retain a small paid/scheduled cleanup worker for deletion jobs. If the app later requires guaranteed hourly synchronization or prompt processing while users are away, keep or restore a paid always-on provider worker instead of presenting request-driven processing as equivalent.

## Source map

| Concern | Current source |
| --- | --- |
| Production services and worker commands | `docker-compose.prod.yml` |
| Memory worker startup/poll loop and job handling | `apps/core-api/src/memory-worker.ts` |
| Memory outbox persistence, claiming, retry, deletion | `apps/core-api/src/repositories/progress-repository.ts` |
| Provider worker startup/poll loop | `apps/core-api/src/provider-sync-worker.ts` |
| Provider job processing, leases, retry, hourly re-enqueue | `apps/core-api/src/services/provider-sync-worker.ts` |
| Initial/manual provider job creation and cooldown | `apps/core-api/src/services/provider-sync-service.ts` |
| Provider job persistence and leases | `apps/core-api/src/repositories/provider-sync-repository.ts` |
| Memory/provider worker unit tests | `apps/core-api/src/memory-worker.test.ts`, `apps/core-api/src/services/provider-sync-worker.test.ts`, `apps/core-api/src/services/provider-sync-service.test.ts` |
| Existing deployment and queue documentation to reconcile | `docs/PROJECT_DOCUMENTATION.md`, `README.md` |
