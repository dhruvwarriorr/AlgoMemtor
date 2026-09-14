# Three-provider implementation guide

This is the engineering companion to
[`THREE_PROVIDER_INTEGRATION_PLAN.md`](THREE_PROVIDER_INTEGRATION_PLAN.md).
It describes the contracts and operational rules that every implementation
must follow.

## Contract vocabulary

### Provider identity and provenance

```ts
type ProviderKey = 'codeforces' | 'codechef' | 'leetcode'

type ExtractionStrategy =
  | 'official_json'
  | 'public_graphql'
  | 'embedded_json'
  | 'sanitized_html'
  | 'stale_cache'

interface Provenance {
  provider: ProviderKey
  providerId: string
  canonicalUrl: string
  sourceUrl: string
  extractionStrategy: ExtractionStrategy
  schemaVersion: string
  completeness: 'complete' | 'partial' | 'unknown'
  fetchedAt: string
  stale: boolean
  errorCode?: string
}
```

The TypeScript source uses Zod runtime validation. Provider-specific fields stay
inside adapters; only normalized contracts cross the Express/React/AI boundary.

### Normalized records

The shared package defines `ProviderProfile`, `ProviderSubmission`,
`ProviderSolvedProblem`, `ProviderRatingChange`, `ExternalContest`,
`ContestParticipation`, `ProblemContent`, `ProviderSyncState`, and
`UnifiedAnalytics` (including provider totals, daily solved counts, topic and
difficulty distributions, language usage, ratings, and contest history).
Every external record includes provenance. Dates are ISO strings; provider IDs
are opaque strings; native values are retained alongside derived values.

`ProviderSubmission` may omit `occurredAt` only for a provider observation that
does not expose time. `ProviderSolvedProblem` always has a concrete provider
problem ID. A profile aggregate can never be coerced into this type.

## Adapter interface

The core API owns a common interface:

```ts
interface ProviderAdapter {
  readonly key: ProviderKey
  readonly capabilities: ProviderCapabilityMap
  getHealth(): ProviderFreshness
  searchProblems?(query: ProviderProblemQuery, request?: ProviderAdapterRequest): Promise<ProblemProviderSearchResult>
  getProblemContent?(externalId: string, request?: ProviderAdapterRequest): Promise<ProblemContentResult>
  fetchProfile?(handle: string, request?: ProviderAdapterRequest): Promise<ProviderProfile>
  fetchSubmissions?(handle: string, request?: ProviderAdapterRequest): Promise<ProviderSubmission[]>
  fetchSolvedProblems?(handle: string, request?: ProviderAdapterRequest): Promise<ProviderSolvedProblem[]>
  fetchRatingHistory?(handle: string, request?: ProviderAdapterRequest): Promise<ProviderRatingChange[]>
  listContests?(query?: ProviderContestQuery, request?: ContestProviderRequest): Promise<ContestSearchResult>
  fetchContestParticipation?(handle: string, request?: ProviderAdapterRequest): Promise<ContestParticipation[]>
}
```

Unsupported methods are optional and are guarded by the capability map; callers
must not interpret a missing method as an empty successful result. The current
`ProblemProvider` and `ContestProvider` catalog interfaces remain compatibility
surfaces while profile/activity adapters are migrated.

## Provider source recipes

### Codeforces

- Catalog: official `problemset.problems`, joining `problemStatistics`.
- Profile: `user.info?handles=`.
- Activity: paginated `user.status?handle=&from=&count=`, retaining accepted
  rows with contest/problem identity and submission ID.
- Ratings: `user.rating?handle=`.
- Contests: `contest.list`, and public standings only when explicitly needed.
- Content: canonical problem page only when publicly reachable; sanitize all
  HTML and do not persist source code/editorials/test cases.
- Shared request gate: minimum 2.1 seconds between requests, one retry for
  eligible network/timeout/5xx failures, stale fallback on refresh failure.

### LeetCode

- Catalog: public `questionList` GraphQL query with bounded pagination.
- Detail: public `question(titleSlug)` query; retain only public/free fields.
- Profile: `matchedUser` profile, submit totals, language/skill/calendar/badge
  queries from the public query set.
- Activity: bounded recent accepted submissions; mark incomplete when the
  provider does not expose a complete history.
- Contests: public contest list/ranking/history queries when reachable.
- Source policy: no cookies, CSRF, login, authenticated mutations, or private
  queries. A robots/terms block opens the capability circuit.

### CodeChef

- Catalog: `/api/list/problems/all` with bounded `limit`/`offset` pages.
- Contests: `/api/list/contests/all` (`present_contests`, `future_contests`,
  and past data when available).
- Profile: public profile HTML and embedded rating/heatmap data.
- Content: public problem HTML only through sanitized parsing and only if the
  source permits the deployment policy.
- A 403, CAPTCHA marker, login page, anti-bot interstitial, or malformed
  response is unavailable/stale—not zero.
- Never copy session/CSRF material or use Selenium credential flows from sample
  repositories.

## HTTP, validation, and safety

The shared provider HTTP client enforces:

- HTTPS and an exact host allowlist per provider;
- response-size limits before parsing;
- timeout and abort signals;
- content-type and status validation;
- request spacing and one concurrent request per unofficial source;
- exponential-jitter retries for network/timeout/eligible 5xx only;
- `Retry-After` scheduling for 429; no immediate retry for 403/404/CAPTCHA;
- structured stable errors (`PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`,
  `PROVIDER_BLOCKED`, `PROVIDER_INVALID_RESPONSE`, `PROVIDER_UNAVAILABLE`);
- redacted logs containing no handles, raw payloads, cookies, or auth headers.

Canonical URLs are built from validated IDs, never copied from an arbitrary
provider field. Problem HTML is parsed with an allowlist sanitizer: remove
scripts, styles, forms, iframes, event attributes, unsafe URLs, and embedded
credentials. Premium/private content is replaced with metadata and a provider
link.

## PostgreSQL synchronization

`ProviderSyncJob` has `id`, learner/provider/capability, cursor, status,
`runAfter`, attempts, lease owner/expiry, idempotency key, and last error.
Workers claim rows with a short lease, process bounded pages, upsert normalized
records, advance the cursor only after a successful page, and release/renew
the lease. A crash leaves the cursor unchanged and the lease expires safely.

Schedules:

| Work | Default |
| --- | --- |
| linked user sync | every six hours plus per-user jitter |
| manual refresh | queued asynchronously; 15-minute cooldown |
| global catalog | every six hours |
| upcoming contests | every 15 minutes |
| problem detail/content | lazy low-priority backfill; 30-day TTL |

Deduplicate by `(learnerId, provider, providerId)` or the provider event key.
Changing a handle creates a new identity and never merges histories. Disconnect
pauses future jobs while retaining history. Explicit provider-history deletion
removes snapshots, activity, solved observations, rating/contest records,
analytics inputs, and AI evidence in one transaction.

## API surface

All routes below require a verified Supabase JWT except public health routes.

```text
GET    /api/problems
GET    /api/problems/:provider/:externalId
GET    /api/contests
GET    /api/activity
GET    /api/analytics
POST   /api/provider-accounts/:provider/sync       -> 202 + job/status
GET    /api/provider-accounts/:provider/sync-status
DELETE /api/provider-accounts/:provider/history
```

Responses include provider freshness, completeness, warnings, and source
attribution. Existing public-statistics, profile-refresh, and Codeforces
activity routes remain synchronous compatibility shims for older clients; the
new profile controls and unified activity surfaces use the queued sync API.
They can be deprecated once all external clients migrate without changing the
unified contract.

Query filters use URL parameters: omit `provider` for All, or pass one provider
key, plus topics,
difficulty, status, contest, date range, and cursor/page. Invalid provider IDs,
unsafe URLs, and unknown AI-selected IDs are rejected with stable errors.

## Frontend and AI rules

React uses the central authenticated API client and TanStack Query. New unified
pages are additive: Profile, Problems, Problem Detail, Activity, Contests, and
Analytics. Every page offers `All | Codeforces | CodeChef | LeetCode`, keyboard
accessible controls, responsive layouts, and distinct loading/empty/stale/
partial/error states.

FastAPI receives only a bounded candidate set and derived learner signals by
default. It returns IDs, scores, and reasons. Express validates every ID and
attaches the trusted canonical URL. Deterministic ranking remains the fallback
when AI or a provider is unavailable. Full statements and solutions are never
sent to AI by default.

## Configuration and runbook

Document every variable in `apps/core-api/.env.example`. Minimum flags include:

```text
PROVIDER_CODEFORCES_ENABLED=true
PROVIDER_CODECHEF_ENABLED=true
PROVIDER_LEETCODE_ENABLED=true
PROVIDER_<KEY>_<CAPABILITY>_ENABLED=true
PROVIDER_CATALOG_CACHE_TTL_SECONDS=21600
PROVIDER_CONTEST_CACHE_TTL_SECONDS=900
PROVIDER_CONTENT_CACHE_TTL_SECONDS=2592000
PROVIDER_TIMEOUT_MS=8000
PROVIDER_MAX_ATTEMPTS=2
```

The linked-user worker uses a six-hour interval with jitter and the manual sync
endpoint enforces a fifteen-minute cooldown. To disable a source, set its
provider or capability flag false and restart/reload config. The worker stops
new requests and marks data stale; it does not erase history. Inspect sync
status and source-health metrics before re-enabling. Redact all provider
payloads in incident reports. A fixed outbound proxy can be supplied by the
deployment's fetch/dispatcher integration; the default runtime never rotates
proxies or uses one to bypass a block.

## Verification checklist

Run the repository's normal checks plus focused provider suites:

```text
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

The release gate additionally requires migration/integration tests, security
tests (SSRF, oversized bodies, unsafe redirects, HTML injection, cookie/header
logging, premium exclusion), browser tests, opt-in live smoke tests with public
handles only, and a 1,000-linked-identity queue load test. Static checks do not
prove live provider or authenticated browser acceptance.
