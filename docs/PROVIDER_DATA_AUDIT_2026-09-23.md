# Provider data audit — 23 September 2026

## Scope and method

This is a read-only audit of the current checkout and the **local** PostgreSQL database, sampled at approximately **2026-09-23 03:48 UTC** (09:18 Asia/Kolkata). It covers CodeChef, Codeforces, and LeetCode. No live provider request, production database check, or authenticated browser check was made for this report. The local database contains three user rows and five active linked-account rows; counts below are anonymized aggregates across those rows and must not be assumed to represent one learner or production traffic.

There are two distinct data paths:

1. **Linked-user data**: consented public profile totals, recent activity, concrete solved observations, rating history, and contest participation. The hourly sync worker stores these in the `core` schema. A profile total is not a complete list of solved problems.
2. **Public catalog data**: provider problem metadata and upcoming/past contest listings. These are shared caches, not evidence that any linked learner solved or entered an item.

“Complete” below is the adapter's bounded-response flag, **not** a guarantee of all-time provider history. Historical profile-snapshot rows are repeated refreshes, not distinct accounts. A solved observation is a provider/problem identity; submissions and accepted verdicts can include repeat attempts.

## What is stored locally now

### Linked accounts and learner activity

| Provider | Active linked accounts | Stats consented | Public profile solved totals | Stored submissions (accepted) | Distinct solved observations | Rating changes | Contest participations | Latest successful linked-user sync |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |
| CodeChef | 1 | 1 | 142 | 16 (15) | 15 | 18 | 18 | 23 Sep, 02:57 UTC; **partial** |
| Codeforces | 2 | 2 | 688 + 88 = **776** | 1,124 (719) | 688 | 24 | 24 | 23 Sep, 02:59 UTC for **one** account; complete for that bounded fetch |
| LeetCode | 2 | 1 | 263 for the consented account | 20 (11) | 9 | 7 | 8 | 23 Sep, 03:01 UTC for **one** account; **partial** |

The Codeforces `88`-solve account has **no stored submissions, solved observations, profile snapshot, ratings, contest participation, or sync-state row**. Its stored stats-fetch timestamp predates its linked-at timestamp, so it should be treated as inconsistent local/legacy or imported state—not evidence of a successful current sync. The second LeetCode account has no public-stats consent and no stored provider activity; the worker intentionally skips it until consent is granted. `syncEnabled` is true on all five account rows, but that alone does not bypass consent or ensure a job has succeeded.

| Provider | Observed submissions in last 30 days | Observed distinct solves in last 30 days | Solved observations with tags and mapped topics | Profile-level topic/language/calendar data | Important coverage note |
| --- | ---: | ---: | ---: | --- | --- |
| CodeChef | 15 | 14 | 15 / 15 | None in the profile snapshot | Activity is always marked partial. |
| Codeforces | 36 | 28 | 659 / 688; **29 tagless** | None in the profile snapshot | Only one of two linked accounts has concrete activity. |
| LeetCode | 20 | 9 | **0 / 9** | 37 topic-count keys, 1 language-count key, nonempty calendar for the synced account | Aggregate topic counts exist, but the nine concrete solves lack attached tags. |

All 16 CodeChef and 20 LeetCode stored submissions have a language and event time. The current Codeforces submission storage has event times but **no language values**. LeetCode's nine solved-observation IDs are title slugs; none match the catalog's numeric external IDs directly. Eight can be joined to a cached catalog item by canonical URL, but that is a downstream enrichment opportunity, not tags already persisted on those observations.

The current database also has 51 CodeChef, 28 Codeforces, and 52 LeetCode profile-snapshot **rows**. These are refresh history, not extra linked users. The Codeforces account with the live sync has a separately stored public solved total; its profile snapshot does not carry that total.

### Shared public caches

| Provider | Cached problem metadata | Cache coverage flag | Cached public contests | Notable fields/gaps |
| --- | ---: | --- | ---: | --- |
| CodeChef | 20 | All `partial` | 29 | All 20 have acceptance/public stats; only 5 have a difficulty. Catalog “topics” are provider/contest codes, not reliable algorithm tags. |
| Codeforces | 11,229 | All `complete` for the fetched catalog | 2,154 | 10,963 have a numeric difficulty; all 11,229 have public problem statistics. |
| LeetCode | 1,000 | All `partial` | 722 | All have difficulty and acceptance; 154 are paid-only. The default 100-problem × 10-page limit is reached. |

These catalog rows were refreshed on 23 September in the local database and were not marked stale/expired at the sample time. The public contest cache is separate from the per-user contest-participation rows. `core.problem_content_cache` has **zero** rows; the product intentionally does not store full external problem statements.

## What each integration fetches—and what it does not

### Codeforces

- **Fetched:** Official anonymous `user.info` profile basics and rating; `user.status` submissions with verdicts, timestamps, problem IDs and provider tags; a deduplicated accepted-problem set; `user.rating` rating changes, from which account contest participations are derived. The shared `problemset.problems` catalog supplies problem metadata, tags, ratings, public solved counts, and canonical URLs. Public contests are fetched separately.
- **Bound:** The linked-account submission request starts at record 1 and defaults to **10,000** records. It is marked incomplete when the response reaches that cap or has invalid records. The local synced account has 1,124 stored submissions, but that alone is not proof of unbounded lifetime coverage.
- **Not fetched/stored:** Authenticated or private data, source code, the submission programming language in the current stored model, and per-user participation in an unrated contest that does not appear in `user.rating`. Twenty-nine local solved observations have no usable topic tags. The second linked account has only an aggregate total and no current activity sync.
- **Source:** `apps/core-api/src/integrations/provider-accounts/codeforces-public-stats.ts`, `codeforces-profile.ts`, and `apps/core-api/src/integrations/codeforces/codeforces-provider.ts`.

### CodeChef

- **Fetched:** Public-profile aggregate solved count, basic profile/rating/rank, one page (`page=0`) of public recent user activity, accepted problem codes, available verdict/language/time, and rating/contest history exposed on the public profile. Up to **25 accepted codes** are enriched with public problem details to obtain `computed_tags`/`user_tags`. Shared catalog and public contests are fetched separately.
- **Bound:** The activity adapter returns `complete: false` by design. If the recent endpoint fails, it can fall back to problem codes parsed from the public profile; such fallback records may have no event time. The catalog requests the first provider list only, with a default **5,000-item** limit and no pagination; only 20 catalog records are cached locally.
- **Not fetched/stored:** A verified complete lifetime submission or solved-problem history, profile-level language/topic/calendar counts, and reliable algorithmic topics from the shared catalog. Contest-series labels and codes must not be interpreted as DSA tags. Problem detail enrichment stops after 25 accepted codes for a sync.
- **Source:** `apps/core-api/src/integrations/provider-accounts/codechef-public-stats.ts`, `codechef-profile.ts`, `codechef-activity.ts`, and `apps/core-api/src/integrations/codechef/codechef-provider.ts`.

### LeetCode

- **Fetched:** Public GraphQL aggregate solve totals by difficulty; public profile basics, badges, aggregate solved counts by language/topic, submission calendar, and contest rating/rank; recent public submissions with status/language/time; attended contest/rating history. For recent slugs, a separate `question` request can supply problem ID and topic tags. The shared catalog includes title, slug, tags, difficulty, acceptance, paid-only flag, and canonical URL; public contests are separate.
- **Bound:** Recent submissions default to **100** (configurable up to 200), and only the first **50 unique slugs** are hydrated for question details per request. The shared catalog defaults to **1,000** records (100 per page × 10 pages), which explains its partial local coverage. An aggregate total of 263 does **not** provide identities for 263 solves.
- **Not fetched/stored:** Complete all-time per-problem solve/submission history, private submissions, premium problem content, or source code. Locally, all nine concrete solved observations are tagless despite 37 aggregate profile topic-count keys. The question-detail helper returns an empty map on an invalid response or exception, without surfacing a separate detail-enrichment failure in the stored sync state; therefore the exact cause of the missing tags is **not provable from this database snapshot**. One linked account has no public-stats consent and no data.
- **Source:** `apps/core-api/src/integrations/provider-accounts/leetcode-public-stats.ts`, `leetcode-profile.ts`, `leetcode-activity.ts`, and `apps/core-api/src/integrations/leetcode/leetcode-provider.ts`.

## Consequences for product claims and next checks

1. **Do not report the provider totals as topic-level evidence.** The 776 Codeforces and 263 LeetCode totals are exposure counts for the linked accounts, not lists of tagged solved IDs. The 30-day figures are based on stored concrete observations and can undercount when the public recent feed is bounded or a linked account has not synced.
2. **Investigate the two accounts without current data.** The extra Codeforces row has inconsistent timestamps and no sync state; the extra LeetCode row lacks consent. Diagnose those rows owner-scoped before treating them as active provider coverage. Do not silently merge their aggregate totals into another user's learning assessment.
3. **Make LeetCode tag enrichment observable.** Verify whether the `question` detail request is failing, malformed, or omitted; preserve the partial result but record a safe enrichment warning. A canonical-URL match to the catalog exists for eight of nine local solved observations and could be used by a separately validated enrichment path.
4. **Review CodeChef catalog breadth and taxonomy.** Twenty cached records and contest-code labels are too narrow for broad algorithm-topic recommendations. Keep unknown tags unknown rather than inventing topics.
5. **Validate against live provider/browser behavior separately.** This audit establishes local persisted state and code-path limits only. A fresh sync of a consented account plus Insights/Coach UI checks is needed before claiming user-visible completeness or current provider freshness.

The sync implementation and consent gate are in `apps/core-api/src/services/provider-sync-worker.ts` and its service wiring in `apps/core-api/src/provider-sync-worker.ts`. The persistent account, profile, submission, solve, rating, contest, catalog, and sync-state models are in `apps/core-api/prisma/schema.prisma`.
