# Unified Codeforces, CodeChef, and LeetCode Integration Plan

## Purpose

This document is the delivery plan for making AlgoMemtor a single discovery,
progress, and analytics layer over Codeforces, CodeChef, and LeetCode. The
external platforms remain authoritative for problem statements, execution,
submissions, and verdicts. AlgoMemtor stores normalized public metadata,
attributed observations, and learner-owned analytics needed for coaching.

The current Codeforces catalog and provider-account statistics work are the
baseline. The implementation adds two AlgoMemtor-owned adapters and generalizes
the existing contracts instead of importing or running a third-party demo API.
The linked repositories are reference material for request shapes and parsing
ideas only.

## Product boundary and explicit risk acceptance

The product may read public data from the three providers, subject to a
source-specific kill switch and safe degradation. It must never:

- request or store passwords, session cookies, CSRF tokens, private responses,
  source code, or credentials;
- bypass authentication, CAPTCHA, paywalls, robots/access controls, or a
  persistent provider block;
- rotate proxies or use browser automation to defeat anti-bot controls; or
- present a public handle as proof of account ownership.

LeetCode's public GraphQL and CodeChef's public HTML/problem paths are a
deployment risk because their robots policies and terms may prohibit crawling.
ADR 0005 records the product owner's explicit risk acceptance. Operations can
disable a capability without taking down the provider or the rest of the app.
Full public/free problem content is optional and is sanitized as untrusted
provider data. Premium/private material is metadata-and-link only.

## Source and capability matrix

| Provider | Primary source | Fallbacks | Capabilities | Important limits |
| --- | --- | --- | --- | --- |
| Codeforces | Official `problemset.problems`, `user.info`, `user.status`, `user.rating`, `contest.list`, and public standings | Approved public problem/profile HTML, then database cache | catalog, content, profile, submissions, solved observations, ratings, contests, participation | shared 2.1-second request gate; API responses are bounded/paginated |
| LeetCode | Public website GraphQL queries for problem list/question/profile/submission/skill/language/calendar/badge/contest data | Split GraphQL queries, structured public-page data, sanitized HTML, then cache | catalog, public/free content, profile, bounded recent activity, ratings, contests | GraphQL/robots/terms may change; no authenticated mutations or cookies |
| CodeChef | Public `/api/list/problems/all` and `/api/list/contests/all` JSON | Embedded public profile data, public profile/problem/contest HTML, then cache | catalog, public/free content, profile, ratings/heatmap, contests, participation where public | anti-bot blocks are unavailable/stale; at least one-second spacing |

Reference repositories used during adapter design:

- [alfa-leetcode-api](https://github.com/alfaarghya/alfa-leetcode-api) is the
  primary LeetCode request-shape reference.
- [leetcode-graphql-queries](https://github.com/akarsh1995/leetcode-graphql-queries)
  supplies public problem and profile query examples.
- [leetcode-stats-api](https://github.com/JeremyTsaii/leetcode-stats-api) and
  [faisal-shohag/leetcode_api](https://github.com/faisal-shohag/leetcode_api)
  supply aggregate/profile response ideas only.
- [Codechef-API](https://github.com/deepaksuthar40128/Codechef-API),
  [leetcode-gfg-codechef-api](https://github.com/coder-writes/leetcode-gfg-codechef-api),
  and [CodeChefAPI](https://github.com/Yash2003Bisht/CodeChefAPI) supply public
  endpoint and extraction ideas. Embedded session material and Selenium
  credential behavior are intentionally excluded.

## Architecture

```text
React/Vite
   |
   +-- authenticated /api/* --> Express core API
                                |
                                +-- ProviderSyncQueue (PostgreSQL leases)
                                +-- shared provider HTTP policy
                                +-- CodeforcesAdapter
                                +-- CodeChefAdapter
                                +-- LeetCodeAdapter
                                +-- normalized cache/repositories
                                +-- deterministic filtering and URL safety
                                |
                                +-- bounded candidates --> FastAPI AI API
                                                               |
                                                               +-- ranking,
                                                                   explanations,
                                                                   learner memory
```

Every adapter owns raw DTO validation, source selection, normalization, safe
canonical URL construction, and extraction provenance. React never calls a
provider directly. Provider records carry:

```text
provider, providerId, canonicalUrl, extractionStrategy, sourceUrl,
schemaVersion, completeness, fetchedAt, stale/error state
```

The common `ProviderAdapter` exposes capability flags for unsupported,
temporarily unavailable, incomplete, and disabled domains. A failure in one
capability does not disable the whole provider.

## Data model

Prisma owns the `core` schema. The generalized models are:

| Model | Purpose | Retention/deletion |
| --- | --- | --- |
| `ExternalProblemCache` | normalized catalog metadata for every provider | cache TTL; provider records may be refreshed or marked stale |
| `ProblemContentCache` | sanitized public/free content and provenance | lazy 30-day refresh; premium content omitted |
| `ExternalContest` | upcoming and historical contest metadata | retained while useful; provider refreshes are idempotent |
| `ProviderAccount` | one active public identity per learner/provider | disconnect stops sync; identity/history retained |
| `ProviderProfileSnapshot` | profile/rating/language/topic snapshots | retained until explicit history deletion |
| `ProviderSubmission` | normalized public submission/activity events | provider-specific completeness is explicit |
| `ProviderSolvedObservation` | concrete provider problem accepted/solved observation | never synthesized from aggregate totals |
| `ProviderRatingChange` | native rating deltas/history | native value and provider percentile both retained |
| `ContestParticipation` | learner's public contest participation/rank | retained until explicit deletion |
| `ProviderSyncState` | cursor, source health, freshness, error, circuit state | one row per learner/provider/capability |
| `ProviderSyncJob` | durable queued work with lease/retry metadata | completed jobs may be compacted after audit retention |

Existing Codeforces verified-activity rows migrate into
`ProviderSolvedObservation` without changing learner-facing manual status.
Manual and provider-derived evidence stay separate. Deleting provider history
cascades through snapshots, events, analytics inputs, and AI evidence.

## Normalized semantics

- `ProviderKey` is exactly `codeforces | codechef | leetcode` for this release.
- Combined solved total is the arithmetic sum of the latest totals from active
  connected providers. No cross-platform equivalence deduplication is attempted.
- Analytics daily-solve counts use one concrete solved observation per
  provider/problem and fall back to a manual solved event only when no provider
  timestamp exists.
- A problem status changes from provider data only when a concrete provider
  problem identifier is present. Aggregate totals never create rows.
- CodeChef solved links without a timestamp use `occurredAt: null`.
- LeetCode bounded accepted activity is explicitly `complete: false` when the
  provider cannot prove the full history.
- Codeforces pagination and all fallback paths record completeness.
- Native difficulty/rating is retained. A versioned normalized difficulty and
  provider-relative percentile support cross-platform ranking.
- Native tags remain visible. A versioned topic-alias registry may add shared
  topics, but unknown tags are never discarded.
- Canonical links are constructed only from validated identifiers and approved
  HTTPS hosts.

## Delivery phases

### Phase 1 — Contracts and persistence

Expand shared Zod contracts, adapter capability types, provenance/error types,
Prisma models, migrations, repositories, and deletion behavior. Add migration
tests proving existing Codeforces cache/progress/activity survives.

### Phase 2 — Queue and source health

Add PostgreSQL-backed jobs with row leases, six-hour linked-user scheduling with
jitter, 15-minute manual-refresh cooldown, six-hour global catalog refresh,
15-minute upcoming-contest refresh, and lazy 30-day content refresh. Add
per-capability circuit breakers, strategy health, schema-change telemetry, safe
logging, response-size limits, retry/`Retry-After` handling, and optional fixed
outbound proxy configuration.

### Phase 3 — Provider adapters

Generalize the Codeforces adapter and add independent CodeChef and LeetCode
adapters. Each follows:

```text
documented/public JSON -> public GraphQL -> embedded data -> sanitized HTML -> cache
```

No linked demo server is a production dependency. Fixtures cover valid,
partial, malformed, blocked, rate-limited, redirected, and changed-schema
responses.

### Phase 4 — API aggregation

Database-backed `GET /api/problems`, detail/content, contests, activity,
analytics, sync, sync-status, and history-deletion endpoints replace provider
literals. Existing public-statistics and Codeforces activity routes remain as
compatibility shims until all UI consumers migrate.

### Phase 5 — Product surfaces and AI

Deliver Unified Profile, Problems, Problem Detail, Activity, Contests, and
Analytics with `All | Codeforces | CodeChef | LeetCode` filters and honest
stale/partial states. Feed bounded normalized metadata and derived learner
features to deterministic/AI ranking. Validate selected IDs and attach trusted
URLs in Express.

### Phase 6 — Acceptance and operations

Run contract, adapter, migration, sync, security, analytics, accessibility,
browser, opt-in live smoke, and worker load tests. Load-test at least 1,000
linked identities and verify the six-hour queue window without violating
provider gates. Update roadmap acceptance only after evidence exists.

## Failure and privacy policy

The UI distinguishes fresh, stale, partial, unavailable, and disabled data. A
CAPTCHA, login requirement, paywall, persistent 403, oversized response,
unsafe redirect, or repeated schema validation failure opens the affected
capability circuit. Last-known valid data may be served with a stale label; a
provider failure must never become a fabricated zero.

Logs contain provider, capability, strategy, status, retryability, duration, and
safe aggregate counts only. Handles, raw HTML/GraphQL/API bodies, cookies,
authorization headers, and private error details are excluded.

Long-lived public-sync consent is versioned at linking. Ownership remains
`not_verified`. Disconnect stops jobs but retains history. The learner can
permanently delete one provider's history or all learner data.

## Acceptance criteria

Implementation is complete only when:

1. all three providers pass adapter fixture and contract suites;
2. existing Codeforces cache, activity, progress, and recommendation data
   survives migration;
3. queue leases, retries, cooldowns, cursors, idempotency, and circuit breakers
   are integration-tested;
4. all authenticated API routes and React consumers use normalized contracts;
5. host allowlists, SSRF, response size, unsafe redirect, injection, cookie
   logging, and premium/private-content tests pass;
6. browser tests cover linking, manual sync, filters, detail, activity,
   contests, analytics, mobile layouts, and accessibility;
7. combined totals equal the exact sum of active provider totals and visibly
   qualify stale/incomplete inputs; and
8. opt-in live smoke and 1,000-identity worker evidence are recorded separately
   from local static tests.

## Rollback and kill switches

Each provider and capability has independent flags:

```text
PROVIDER_CODEFORCES_ENABLED
PROVIDER_CODECHEF_ENABLED
PROVIDER_LEETCODE_ENABLED
PROVIDER_<KEY>_<CAPABILITY>_ENABLED
```

Disabling a flag stops new jobs and external requests, preserves last-known
data as stale, and leaves canonical links available. A migration rollback must
not delete learner-owned history; use a forward migration or read-only fallback
instead.
