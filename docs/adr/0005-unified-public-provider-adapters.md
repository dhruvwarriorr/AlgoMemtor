# ADR 0005: Unified public-data adapters for Codeforces, CodeChef, and LeetCode

## Status

Accepted — explicit product-owner risk acceptance for the three-provider
integration release

## Date

2026-09-14

## Context

AlgoMemtor's current provider boundary was intentionally conservative. ADR 0002
allows a user-triggered public solved-count refresh for Codeforces, CodeChef,
and LeetCode. ADR 0003 defers CodeChef/LeetCode activity because the existing
integrations expose aggregate totals only. ADR 0004 allows consent-gated
Codeforces accepted-activity evidence. The product now requires one unified
catalog, profile, activity, contest, content, and analytics layer across all
three providers, with six-hour synchronization and database-backed history.

The providers do not offer one common, stable public API. Codeforces has a
documented API; LeetCode's public website GraphQL is useful but robots/terms
create a deployment risk; CodeChef exposes public JSON and HTML but may return
anti-bot pages or blocks. Third-party repositories listed by the product owner
are request-shape references, not runtime dependencies. Their demo servers,
embedded sessions, Selenium credential flows, and hard-coded links are not
acceptable dependencies.

## Decision

1. Implement original, validated AlgoMemtor-owned adapters for Codeforces,
   CodeChef, and LeetCode inside the Express provider gateway. No linked public
   demo API is called at runtime.
2. Permit public JSON, public GraphQL, structured embedded data, and sanitized
   public HTML only for the explicitly configured capability. Each provider and
   capability has an independent kill switch, source health, stale fallback,
   schema version, completeness, and attribution.
3. Accept the operational/legal risk of LeetCode public GraphQL and CodeChef
   public scraping for this release only because the product owner explicitly
   requested it. Before deployment, operators must review current terms,
   robots, attribution, provider contact guidance, and applicable law. A block,
   CAPTCHA, login requirement, paywall, or persistent 403 disables the affected
   capability; the implementation never bypasses it.
4. Generalize normalized contracts and persistence to three providers. Retain
   native values, provenance, completeness, and stale/error states. Keep
   aggregate solved totals separate from concrete solved observations.
5. Run linked-user synchronization every six hours with jitter and queue manual
   refreshes with a 15-minute cooldown. Retain history after disconnect until a
   learner explicitly deletes it. Ownership stays `not_verified`.
6. Preserve the current Codeforces catalog, public statistics, verified
   activity, manual-progress, recommendation, and UI behavior through a
   compatibility period while consumers migrate to unified APIs.
7. Do not add provider authentication, cookies, source-code collection,
   execution/judging, internal submissions, or cross-platform solved-problem
   equivalence deduplication.

## Supersession of earlier ADRs

- ADR 0002 remains authoritative for consent, public-account ownership, and
  aggregate-count semantics. Its “never automatic” and “disconnect deletes
  statistics” rules are superseded by this ADR's long-lived consent, scheduled
  sync, and retain-until-explicit-deletion policy.
- ADR 0003 is superseded only where it defers CodeChef/LeetCode activity. The
  prohibition on inventing per-problem events from aggregate counts remains.
  New activity is allowed only when a concrete public provider problem/event
  identifier is available and its completeness/provenance is recorded.
- ADR 0004 remains authoritative for minimal Codeforces activity evidence,
  consent, deduplication, and no ownership claim. Its manual-only scheduling
  rule is superseded by the six-hour queue policy, and its CodeChef/LeetCode
  aggregate-only statement is superseded only for future adapter capabilities
  that pass the source and acceptance gates above.

## Consequences

### Positive

- One normalized catalog and analytics model can compare all three ecosystems.
- Provider outages are isolated and stale/partial data remains honest.
- Queue leases, idempotency, provenance, and deletion behavior make background
  synchronization auditable and recoverable.
- AI sees bounded, validated metadata rather than arbitrary provider content.

### Negative and risks

- Provider terms, robots policies, HTML/GraphQL schemas, and anti-bot controls
  may change without notice.
- Public profiles do not prove learner ownership; public activity may be
  incomplete or shared.
- Full public/free content increases copyright, attribution, and sanitization
  obligations. Premium/private content is never retrieved.
- Three-provider freshness, rate limits, and source-health operations increase
  infrastructure and test complexity.

## Review triggers

Disable or revisit a capability when a provider changes terms/robots,
introduces authentication/CAPTCHA/paywalls, blocks the source, changes schema,
requests removal, or publishes a supported API. Review before adding cookies,
private data, automated browser access, execution, or source-code storage.

## References

- [Codeforces API help](https://codeforces.com/apiHelp)
- [alfa-leetcode-api](https://github.com/alfaarghya/alfa-leetcode-api)
- [LeetCode GraphQL query collection](https://github.com/akarsh1995/leetcode-graphql-queries)
- [Codechef-API](https://github.com/deepaksuthar40128/Codechef-API)
- [LeetCode terms](https://leetcode.com/terms/)
- [LeetCode robots](https://leetcode.com/robots.txt)
- [CodeChef robots](https://www.codechef.com/robots.txt)
- [ADR 0002](0002-public-provider-profile-statistics.md)
- [ADR 0003](0003-provider-verified-activity-deferral.md)
- [ADR 0004](0004-codeforces-public-activity-evidence.md)

