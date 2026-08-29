# ADR 0002: Public provider profile statistics

## Status

Accepted for the Week 8 learner-profile scope

## Date

2026-08-27

## Context

Learners asked to link Codeforces, CodeChef, and LeetCode accounts during
onboarding and in Settings, and to see a provider-reported solved-problem
count. Codeforces exposes a documented public `user.status` API. CodeChef
publishes a solved total on public profile pages. LeetCode exposes the same
public profile statistic through the website's GraphQL request, but that
interface is not documented as a public developer API.

The existing architecture deferred providers without an approved API and
prohibited scraping. The explicit product request changes that boundary for
this narrow, user-triggered statistic only.

## Decision

AlgoMemtor may fetch the solved-problem total from a learner's public profile
for all three linkable providers:

- Codeforces: documented anonymous `user.status` API, counting unique accepted
  problem identifiers in the returned submission window;
- CodeChef: public profile HTML, extracting the rendered “Total Problems
  Solved” value; and
- LeetCode: public website GraphQL request for `matchedUser` submission totals.

The fetch is never automatic. A learner must first link a public handle and
then explicitly consent to each refresh. Only the total, source label,
completeness flag, and timestamps are stored. No password, session cookie, API
key, submission source code, private activity, or problem statement is
collected.

The backend owns all external requests. Each adapter has a fixed HTTPS
endpoint, response-size limit, timeout, provider-specific parser, stable error
mapping, and request gate. Codeforces uses a shared request gate with the
catalog adapter. A provider response is never treated as account ownership or
proof of an individual solve.

Codeforces can return only a bounded recent submission window. When that limit
is reached, the API returns `complete: false` and the UI says “At least N”.
CodeChef and LeetCode totals are shown as complete only when their expected
public response field is present.

Changing a linked handle clears the previous statistic. Disconnecting a
provider deletes the handle, consent timestamp, and stored statistic. A
failed refresh preserves the last successful total as stale data, or exposes a
transparent unavailable state when no successful total exists.

## Consequences

### Positive

- Learners can connect all requested providers during onboarding or later.
- The data remains small, attributable, and separate from learner solve status.
- Provider-specific failures do not break the rest of the profile flow.
- The Codeforces request budget is coordinated across catalog and profile calls.

### Negative and risks

- CodeChef HTML and LeetCode website GraphQL are implementation details that
  may change without notice.
- Provider terms, robots policies, rate limits, or anti-automation controls may
  require disabling an adapter before deployment.
- A public solved total can lag a provider's internal state and cannot prove
  that the linked handle belongs to the learner.
- Public-statistics refresh adds external latency and another source of stale
  data.

## Operational constraints

- Never bypass CAPTCHA, authentication, access controls, or provider blocks.
- Never request or store provider credentials or session material.
- Keep refresh user-triggered and rate-limited; do not add background polling.
- Keep the feature optional and allow disconnect/deletion at any time.

## Review triggers

Review or disable an adapter if a provider changes the response, blocks the
request, requires authentication, prohibits this use, or offers a supported
public API. Revisit the decision before adding solved-problem lists, submission
history, rating history, private activity, or automatic polling.

## References

- [Codeforces API help](https://codeforces.com/apiHelp)
- [Codeforces API methods](https://codeforces.com/apiHelp/methods)
- [CodeChef public profile](https://www.codechef.com/users/gennady.korotkevich)
- [LeetCode public profile](https://leetcode.com/u/leetcode/)
