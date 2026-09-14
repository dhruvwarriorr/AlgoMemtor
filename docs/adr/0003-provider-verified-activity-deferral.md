# ADR 0003: Defer CodeChef and LeetCode provider-verified activity

## Status

Accepted — Week 13 provider verification is deferred for CodeChef and LeetCode

## Date

2026-09-13

## Context

Week 13 permits provider-verified solves only where a provider API and its terms
support reliable, consented user activity access. Its acceptance checks require
an activity endpoint and evidence mapping, normalized and deduplicated events,
sync state and failure handling, confirmed solves that can set the question
status to `solved`, separate evidence provenance, and disconnect/deletion
behavior.

The current CodeChef and LeetCode integrations do not provide that activity
evidence:

- `CodeChefPublicStatsFetcher` fetches public profile HTML and extracts the
  rendered `Total Problems Solved` value.
- `LeetCodePublicStatsFetcher` sends the website GraphQL `matchedUser` query and
  reads the `submitStatsGlobal.acSubmissionNum` entry whose difficulty is
  `All`.

Both adapters return a public-statistics result containing an aggregate count,
completeness, source, and fetch time. Neither returns a per-problem activity
event with a provider problem ID, event time, or evidence mapping. The LeetCode
request is also a website GraphQL interface rather than a documented public
developer activity API.

The existing provider-account contract deliberately keeps the linked profile
at `verification: not_verified`. A learner gives separate consent before a
user-triggered public solved-count refresh, and the UI states that the feature
does not verify account ownership or individual solves. The count is therefore
profile statistics, not progress evidence.

## Decision

1. Defer individual provider-verified activity for CodeChef and LeetCode. Do
   not infer an individual solve or change a problem's status from an aggregate
   count, a profile link, profile HTML, or the current website GraphQL response.
2. Keep aggregate solved counts as a separate, optional, explicitly consented
   public-profile-statistics feature. Store and expose them through the existing
   provider-account statistics fields (`core.provider_accounts` and
   `publicStats`); they must not be treated as per-problem evidence.
3. Do not create `core.verified_activity`, a Prisma model or migration for it,
   or a provider-event ingestion and deduplication path in this scope. The
   `core.verified_activity` model described as planned Week 13 documentation
   remains unimplemented while this decision holds.
4. Leave the Week 13 acceptance checks incomplete. Week 12 manual progress
   remains the available path for learner status updates, with manual evidence
   kept distinct from any future provider-verified evidence.

## Alternatives considered

### Treat the aggregate total as verified individual activity

Rejected because a total cannot identify which AlgoMemtor problem was solved,
when it was solved, or whether the linked handle belongs to the learner. Doing
so would inflate progress claims and violate the separation between question
status and evidence provenance.

### Derive per-problem events from the current profile integrations

Rejected because the CodeChef integration exposes only an HTML total and the
LeetCode integration exposes only a website GraphQL total. These paths do not
provide the stable, permitted event contract required by Week 13. The product
must not bypass provider authentication, access controls, blocks, or terms to
manufacture that evidence.

### Create the activity table before a provider is suitable

Rejected because a persistence model would imply evidence that the current
integrations cannot substantiate. The dedicated table and event model should
wait for a provider-supported activity flow and its corresponding acceptance
evidence.

## Consequences

### Positive

- Public counts remain useful without being presented as individual solves.
- No unsupported CodeChef or LeetCode activity evidence can set a problem to
  `solved`.
- The schema avoids storing unverifiable provider events and the associated
  privacy, deletion, rate-limit, and compliance obligations.
- The existing user-triggered refresh, stale/error handling, and separate
  provider-account statistics behavior remain unchanged.

### Negative

- Week 13 is not complete: there is no CodeChef or LeetCode verified-activity
  sync, reconciliation, or provider evidence that can update problem status.
- Aggregate totals may be stale or change independently of AlgoMemtor's
  problem-level manual progress.
- A future verified-activity integration will require a fresh provider and
  terms review, explicit consent/authorization, and implementation evidence
  before this deferral can be revisited.

## Review triggers

Revisit this decision only if CodeChef or LeetCode provides a provider-supported
and permitted activity or authorization flow with stable problem identifiers,
event semantics, and a reliable mapping to canonical external problems. The
review must also cover learner consent and ownership, rate limits, sync failure
preservation, disconnect/deletion, and reconciliation tests.

## References

- `docs/ROADMAP.md`, Week 13: One provider-verified activity flow
- `docs/adr/0002-public-provider-profile-statistics.md`
- `apps/core-api/src/integrations/provider-accounts/codechef-public-stats.ts`
- `apps/core-api/src/integrations/provider-accounts/leetcode-public-stats.ts`
- `apps/core-api/src/services/provider-account-stats-service.ts`
- `apps/core-api/prisma/schema.prisma`, `ProviderAccount`
