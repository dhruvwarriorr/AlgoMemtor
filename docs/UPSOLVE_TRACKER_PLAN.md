# Upsolve Tracker — product and implementation plan

**Status:** Planning only. No Upsolve Tracker code or migrations have been implemented by this document.

> **Status update (2026-09-24):** an Upsolve Tracker is implemented at
> `/upsolve`, scoped to contests the learner took part in (the product brief's
> Feature 8) rather than the three newest global contests. It flags attempted
> unsolved problems (and reachable unattempted Codeforces problems), tracks
> completion, links hints, editorials and the Solution Explorer, and feeds a
> spaced revision schedule. The in-app reminder bell and reminder preferences in
> §3.3 and §6 are not implemented. See `PROJECT_DOCUMENTATION.md` §4.13.

## 1. Goal and agreed decisions

AlgoMemtor will turn recent contests into a small, guided practice queue. The learner solves and submits on Codeforces, CodeChef, or LeetCode; AlgoMemtor identifies a useful next question, records self-reported or provider-observed progress, and offers a question-specific coach workspace.

| Decision      | Agreed behavior                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contest scope | The three most recently finished eligible contests **globally** across the three providers. Multiple contests may come from one provider. Participation is not required.                                                                                           |
| Priority      | Highlight the newest of those three. The other two are secondary.                                                                                                                                                                                                  |
| Questions     | Show at most two suggested questions per contest, with no full question list on the Upsolve page.                                                                                                                                                                  |
| Selection     | Start immediately after the learner's highest solved question in provider contest order; take the next two without wrapping back. If no solve is recorded, start at Question 1.                                                                                    |
| Coach         | Starting a question may read its public provider page for that turn. Show motivation and optional concepts and three hints; explanation, approach, code, more hints, and a free-form doubt composer are available immediately. The learner chooses what to reveal. |
| History       | Save a separate conversation and reveal progress for each learner and provider question. Treat pasted problem text and code as transient.                                                                                                                          |
| Progress      | Reuse the existing `unsolved` / `attempted` / `solved` manual status action, clearly labeled as self-reported.                                                                                                                                                     |
| Reminders     | Persistent **in-app** reminders only: one hour before a contest, and 9:00 a.m. in the learner's time zone on the day after it ends. Both reminder types start disabled; Settings also has a switch for each provider.                                              |

This is a discovery and coaching feature. Provider links remain the place to read the authoritative statement, use an editor, run code, submit, and receive a verdict. The Upsolve page must not embed a statement, IDE, judge, or submission flow.

## 2. Current baseline and gaps

- [Unified contests](PROJECT_DOCUMENTATION.md#49-unified-contests) and `GET /api/contests` already cover all three providers, but the current service sorts contests by start time ascending before applying its limit. Upsolve needs its own newest-first selection after the provider results are merged.
- Core stores [contest participation, submissions, solved observations, and manual problem actions](PROJECT_DOCUMENTATION.md#46-progress-and-evidence). Those are separate facts. Aggregate solved totals cannot prove that a particular contest question was solved, and bounded provider feeds can leave coverage incomplete.
- Codeforces has normalized catalog identities; CodeChef activity already reads a public contest-detail response containing problem codes; LeetCode currently lists contests but does not have a contest-to-question adapter. Each question source and its ordering must be validated before selection can claim to offer the _next_ question.
- The saved coach, consent flow, and in-app check-in inbox exist. Current check-ins have AI-consent and event-frequency rules that would suppress independent contest reminders. Upsolve reminders therefore need their own preferences and inbox records.
- The provider `getContent` implementations may use persistent content caches. The new Upsolve coach path must make an explicit, uncached, turn-only read so it respects the current rule that page text is not stored.
- The current checkout has unrelated uncommitted work, including coach and canonical-documentation changes. Preserve it; this plan does not authorize a commit or push.

## 3. Page skeleton and interaction

### 3.1 Overview: `/upsolve`

Add **Upsolve** to the existing **Keep practicing** navigation group beside Contests. Keep `/contests` as the general upcoming/historical catalog; `/upsolve` is the focused practice page.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ App navigation                                      Reminder bell (n) │
├──────────────────────────────────────────────────────────────────────┤
│ Upsolve                                      [Sync platforms]         │
│ Pick up where the latest contests left you.                         │
│ Provider coverage / last sync / partial-data note when relevant     │
│                                                                      │
│ ┌─ FEATURED · Latest finished contest ────────────────────────────┐ │
│ │ Provider · Contest name · Finished date/time · participation    │ │
│ │ "Your next questions"                                           │ │
│ │ [Question 1: title, position, status, Start upsolving, source]   │ │
│ │ [Question 2: title, position, status, Start upsolving, source]   │ │
│ │ or a precise complete / unavailable / no-question state        │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ Recent contests                                                     │
│ ┌─ Older contest 1 ───────────────────────────────────────────────┐ │
│ │ Metadata + up to two question rows                              │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌─ Older contest 2 ───────────────────────────────────────────────┐ │
│ │ Metadata + up to two question rows                              │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ [Browse all contests]                      [Reminder settings]       │
└──────────────────────────────────────────────────────────────────────┘
```

Use the established card, typography, focus, and responsive patterns. The featured card gets a clear accent and larger heading, while the two older cards remain equally actionable. Show the provider on every contest and question. Display local dates with the learner's selected time zone; give links meaningful provider labels and `rel="noopener noreferrer"` for new tabs.

**Question row:** contest position, title, difficulty or tags only when validated, status provenance (`Provider accepted`, `Marked solved by you`, `Attempted`, or `No solve recorded`), and actions **Start upsolving** and **Open on provider**. When activity is partial or stale, expose that beside the status instead of silently presenting it as confirmed unsolved.

**Overview states:** loading placeholders shaped like the featured and two secondary cards; authenticated error with Retry; no eligible finished contests; contest found but question list unavailable; zero questions after the highest solve; missing linked account/activity consent; partial/stale provider data. A missing account still permits manual practice, but the UI must say that provider solve coverage is unavailable. Keep unavailable contests in their chronological positions rather than replacing them with older results.

### 3.2 Question workspace: `/upsolve/:provider/:externalId`

```text
Desktop
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Upsolve  /  Contest  /  Question title                                │
│ Provider · Question position · status · [Open on provider] [Status ▼]    │
├───────────────────────────────┬──────────────────────────────────────────┤
│ Guided help                   │ Coach conversation                       │
│ Motivational opening          │ Saved turns for this question            │
│ [Concepts needed ▸]           │ Learner can ask a doubt at any point    │
│ [Hint 1 ▸] [Hint 2 ▸]          │                                          │
│ [Hint 3 ▸]                    │ [Ask a doubt / request another hint ...] │
│ [Explain] [Approach] [Code]   │ [Send]                                   │
└───────────────────────────────┴──────────────────────────────────────────┘

Mobile: breadcrumb and question header → guided help → conversation →
sticky, keyboard-safe composer. Every control remains keyboard reachable.
```

**Start upsolving** creates or reopens the per-question session. The first successful turn produces a short motivation, a bounded list of concepts, and exactly three progressively stronger hints. Their _controls_ are all visible, while concepts and hint bodies are closed initially. Explanation, first approach, complete approach/code, and extra hints are explicit coach requests; no hint gate is imposed. Free-form chat uses the same validated question context, so a learner can ask about the statement, an idea, an error, or a different approach between reveals. The coach should answer direct requests for an approach or code rather than forcing a hint ladder.

Do not pre-generate or reveal complete code on page load. If the question text cannot be read, show **Problem context unavailable** with the canonical provider link and a transient paste control. Do not generate question-specific hints from a title alone. If AI consent is absent, show the existing consent entry point; contest cards, links, and manual status remain usable. If the AI service fails, retain the saved session and offer Retry without fabricating a coaching answer.

The existing manual status control changes progress only after a direct click. Status changes and provider sync invalidate the overview's question selection. A source link, hint reveal, or chat message does not mark a problem attempted or solved. Code generated in a response is shown for that turn with a notice that it will not be retained in saved history.

### 3.3 Reminder UI

Add an unread-count bell to the signed-in app chrome. Its panel lists in-app contest and upsolve reminders newest first, each linking to its contest or question, with mark-read and dismiss actions. Settings gets an **Upsolve reminders** section containing separate pre-contest and next-day switches, provider switches, and an editable IANA time zone. Both reminder types default off; provider switches default on but have no effect until a reminder type is enabled. Show the one-hour and next-day 9:00 a.m. defaults next to the controls.

## 4. Selection and provider rules

1. In Express, merge eligible provider contest catalogs, require a valid `endsAt` in the past, sort by `endsAt` descending with stable provider/ID tie-breaks, then keep exactly the newest three. Exclude Codeforces gyms, CodeChef practice/skill-test entries, and LeetCode virtual contests; retain normal rated and unrated scheduled contests.
2. Add a bounded, server-side `listContestQuestions` capability with validated provider IDs, contest positions, titles, safe canonical HTTPS URLs, source provenance, and completeness. For Codeforces use the official `contest.standings` problem list; for CodeChef use the validated contest-detail problem codes and contest code; for LeetCode validate a public contest-question feed before depending on it. If a provider's permitted source or order cannot be verified, return `questions_unavailable` for that contest. Do not scrape statements or infer an order from titles/difficulty.
3. Match each question's stable provider problem identity to stored accepted submissions/solved observations and the latest manual status. An accepted provider observation or a manual `solved` action counts as solved. `attempted` remains eligible. A manual `unsolved` action cannot override concrete accepted evidence.
4. Find the greatest contest position with solved evidence. Scan only positions after it, skip any additional solved positions, and take at most two. If there is no solved evidence, start at position one. Never wrap around or fill from an older contest. Zero or one remaining question is an honest result.
5. With incomplete or stale provider coverage, recommendations remain available from known facts but use **No solve recorded** and show the coverage warning. The API supplies `selectionReason`, `statusSource`, `coverage`, and `freshness`; React does not recalculate the ranking or construct provider URLs.

The CodeChef catalog's external contest ID and URL contest code differ, so the normalized server-side contest record needs a validated contest code for the detail lookup. Keep raw provider DTOs inside adapters. Reuse the project's request gate, bounded fetch, cache freshness, stable provider error, and safe logging conventions. Cache only permitted contest/question metadata; never store full external statements for this feature.

## 5. Contracts, persistence, and service flow

### Public API and shared contract

Define Zod request/response schemas in shared contracts and update Express, React, mocks, and tests together. Use the existing authenticated client and owner-scoped repository patterns.

| Endpoint                                                            | Purpose                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/upsolve`                                                  | Three contest summaries, up to two suggested questions each, participation, status provenance, selection reason, and provider freshness/partial warnings.                                              |
| `POST /api/upsolve/sessions`                                        | Idempotently create or reopen a session from validated `{ provider, contestId, externalId }`; return its ID and linked coach conversation ID.                                                          |
| `GET /api/upsolve/sessions/:id`                                     | Read owner-scoped question identity, saved motivation/concepts/hints, reveal state, and saved conversation.                                                                                            |
| `PATCH /api/upsolve/sessions/:id/reveals`                           | Save which concept/hint panels the learner opened. Accept only known reveal keys.                                                                                                                      |
| `POST /api/upsolve/sessions/:id/coach`                              | Request `start`, `explain`, `approach`, `code`, `more_hint`, or `question`; free text is allowed only for `question`. The server resolves the trusted problem identity and supplies turn-only context. |
| `GET` / `PUT /api/upsolve/reminder-preferences`                     | Read or replace the two toggles, three provider switches, and time zone.                                                                                                                               |
| `GET /api/upsolve/reminders` and `PATCH /api/upsolve/reminders/:id` | Read owner-scoped inbox/unread count and mark read or dismissed.                                                                                                                                       |

Return stable IDs and explicit `available`, `partial`, and `stale` indicators. Parse every request and response with shared schemas. The client must not supply a provider URL, a solved verdict, or arbitrary question text as trusted context. The manual status action remains the existing `PUT /api/problems/:provider/:externalId/status` API.

### Core tables and ownership

- `core.upsolve_sessions`: user ID, provider, validated external problem ID, originating contest ID, linked coach conversation ID, derived opening payload, reveal state, timestamps. Unique `(user_id, provider, external_problem_id)` so reopening a question finds the same conversation. Deleting that conversation removes its session link/session; deleting the learner cascades everything.
- `core.upsolve_reminder_preferences`: one row per user with `pre_contest_enabled`, `next_day_enabled`, three provider switches, IANA time zone, and timestamps. Keep this separate from AI coach check-in preferences so deterministic reminders work without AI consent.
- `core.upsolve_reminders`: user ID, provider, contest ID, type, scheduled/delivered timestamps, title and short text, read/dismissed state. A unique `(user_id, provider, contest_id, type)` key makes retries safe. Store only metadata and canonical internal navigation, not page text.

Prisma owns these `core` migrations and repositories. No Alembic table is required unless the AI service later needs its own audit data; the current AI auditing path remains in use. Account deletion cascades all new rows. Provider history deletion or disconnect invalidates derived selection and cancels pending reminders for that provider; saved user-authored chats retain the existing coach deletion controls and must stop presenting old provider status as current.

### Coach boundaries

Express validates the session's provider question and performs or requests a bounded, **uncached** turn-only read when the learner starts or asks a question. It sends only the selected problem context needed for that turn to FastAPI under the existing personalized-coaching consent. FastAPI returns a structured opening (`motivation`, `concepts[]`, `hints[3]`) and uses the existing coach conversation for further turns. Persist the derived opening and safe text turns, but omit fetched statements, pasted context, source code, generated code blocks, and raw prompts from saved messages, summaries, memories, and audits. Preserve the current trusted-link and no-invented-problem-ID rules.

## 6. Reminder scheduling rules

- A server worker, not a React timer, checks due reminders from validated contest schedule metadata. Pre-contest due time is `startsAt − 1 hour`; next-day due time is 09:00 on the calendar day after `endsAt` in the saved IANA time zone. Handle daylight-saving transitions using that time zone, not a fixed UTC offset.
- At delivery, recheck the current user switches, provider eligibility, contest schedule/status, and deduplication key. A pre-contest reminder never appears after start. If enabled inside the final hour before start, deliver once immediately while the contest is still upcoming. Do not retroactively create pre-contest reminders for already-started contests.
- A next-day reminder links to the Upsolve contest. Send it only if the contest has at least one actionable suggested question; if question data is temporarily unavailable, retry while that local next day is still in progress. After that day, skip the stale reminder. Recompute the suggested question count at delivery so already-solved contests do not create a nudge.
- Disabling a switch or provider immediately prevents future delivery; existing inbox items remain read/dismissible. A failed provider refresh preserves last-known-good metadata with a visible stale flag, but never schedules from an unvalidated or missing time. No email, browser permission, service worker, or closed-browser push is in this version.

## 7. Detailed action plan

### Step 0 — Validate provider question sources

Read-only probe one recent finished contest per provider using the same server-side HTTP rules as the current adapters. Record the actual public response shape, order field, safe problem identity, and failure behavior. Confirm CodeChef's catalog ID ↔ contest code mapping and LeetCode's public contest-question availability. This is a gate: a provider without a permitted, order-preserving source gets an honest unavailable state, not a guessed implementation.

### Step 1 — Contracts and core data

Add shared Upsolve schemas and tests. Add the three Prisma tables, constraints, indexes, and repositories. Define the session and reminder deletion behavior in the migration/repository tests. Keep optional fields omitted rather than set to `undefined` under the workspace's strict TypeScript rules.

### Step 2 — Contest selection service

Implement the provider question adapters, global newest-three query, identity joins, after-highest-solve selection, and freshness/coverage response. Write mocked HTTP tests for each adapter and service tests for sorting, ties, partial provider failures, solved/attempted/manual evidence, zero remaining questions, malformed records, paid or unavailable questions, and safe URLs. Keep a valid partial result when another provider fails.

### Step 3 — Guided coach sessions

Add owner-scoped session APIs and structured opening generation. Bind each request to the session's trusted question rather than a client URL. Add a turn-only content path that bypasses the existing persistent problem-content cache. Wire intro/reveal persistence, free-form doubts, extra hints, explanation, approach, and explicit code requests. Test AI consent, missing content/paste fallback, AI timeout, saved-session reopening, and redaction of statements and code.

### Step 4 — Reminders and Settings

Add independent preferences and the due-reminder worker with the unique delivery key. Add Settings controls, bell/inbox UI, unread count, and deep links. Test opt-in defaults, each provider switch, timezone changes and DST, rechecks at delivery, worker retries, duplicate prevention, missed windows, dismissal, and cross-user access rejection.

### Step 5 — Upsolve pages and integration

Add the protected overview and question-workspace routes, typed API hooks, query-key invalidation after status changes and provider sync, responsive layout, loading/error/empty/partial states, and keyboard-accessible reveal controls. Integrate the nav item without redesigning unrelated screens. Test desktop and mobile browser flows with linked and unlinked account states, consent on/off, question-source outage, and returning to a saved session.

### Step 6 — Documentation and acceptance

Update `docs/PROJECT_DOCUMENTATION.md` once behavior and contracts exist. Run focused shared-contract, core, web, and AI tests, typechecks, lint/format checks, builds, `git diff --check`, and a live provider smoke check for each question source. Browser-test the actual protected flow when a Supabase session is available. Report separately what is implemented, locally checked, and live validated; do not claim provider or browser acceptance from fixtures alone.

## 8. Acceptance checklist

- [ ] The newest eligible finished contest is featured, and exactly the next two most recent eligible contests appear below, irrespective of provider mix or participation.
- [ ] Each contest shows zero, one, or two **next** questions after the highest solved position, with no wraparound and no invented question identity or URL.
- [ ] Partial sync or unavailable questions are named honestly; one provider outage does not hide valid results from another.
- [ ] A learner can start a question, reveal the three hints independently, inspect concepts, request explanation/approach/code, ask doubts, and reopen the same saved question conversation.
- [ ] Public problem text and pasted context are used only for the relevant coach turn; source code, generated code, and raw problem text are absent from saved history, memory, and audits.
- [ ] Manual status is explicitly self-reported, accepted provider evidence remains distinct, and neither navigation nor coach interaction changes progress automatically.
- [ ] Both reminder types are off by default, provider switches and time zone work, due reminders appear once in the in-app inbox, and disabled or obsolete reminders do not fire.
- [ ] Settings, overview, workspace, and inbox work on desktop/mobile with keyboard navigation and visible loading, empty, error, partial, and retry states.
- [ ] No unrelated work is changed, and no commit or push is performed without an explicit request.
