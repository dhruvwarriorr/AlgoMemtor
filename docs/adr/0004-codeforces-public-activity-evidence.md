# ADR 0004: Consent-gated Codeforces public activity evidence

## Status

Accepted for roadmap Phase 9

## Date

2026-09-14

## Context

Phase 9 needs a provider-permitted way to confirm individual problem activity
without hosting problem content or claiming that a linked public handle belongs
to the learner. Codeforces documents the anonymous `user.status` endpoint. Its
submission objects expose a public submission identifier, problem identity,
creation time, and verdict. The response is bounded by a requested submission
window and must respect Codeforces request limits.

The existing Week 8 integration stores only aggregate solved counts. A separate
evidence table is required so per-problem observations remain append-only,
idempotent, attributable, and removable without changing unrelated manual
progress.

## Decision

AlgoMemtor may fetch Codeforces accepted-problem activity only after the learner
has linked a public handle and explicitly enabled the
`codeforces-public-activity-v1` consent policy. Synchronization is manual and
rate-limited per learner; there is no background polling.

Only submissions with verdict `OK` and a valid contest/problem identity,
provider submission ID, and creation timestamp become evidence. Duplicate
submissions collapse to one learner/provider/problem record. A bounded or
partially malformed response is retained as partial evidence and never deletes
previously observed records.

The database stores provider and problem identifiers, provider event ID,
provider occurrence time, observation timestamps, and the linked progress-action
ID. It never stores source code, language, tests, statements, raw provider
payloads, credentials, or session material. A public handle is not proof of
account ownership.

Each newly observed problem appends a `provider_verified` solved action. Manual
status changes remain the learner's latest current label; provider evidence is
still retained in history. Revoking activity consent, changing the linked
handle, disconnecting Codeforces, or deleting learner data removes the evidence
and provider-generated actions.

CodeChef and LeetCode remain aggregate-only under ADR 0002 and ADR 0003 because
the approved integrations do not provide an accepted-problem event stream.

## Consequences

### Positive

- Individual Codeforces activity is attributable and auditable without storing
  problem content or source code.
- Repeated synchronization is safe and does not duplicate learner status.
- Provider failures preserve prior evidence and expose partial/error state.
- Manual corrections remain authoritative for the current learner label.

### Negative and risks

- A linked public handle can be wrong or shared; the product must never say
  “verified account” or imply ownership.
- The recent-submission window may make the evidence incomplete.
- Codeforces response shape, terms, or rate limits may change.
- Provider-derived status is evidence of public accepted activity, not proof of
  the learner's identity or intent.

## Operational constraints

- Use the official HTTPS API and the shared provider request gate.
- Keep synchronization user-triggered, consent-gated, and cooldown-limited.
- Log only safe aggregate counts, completeness, duration, and stable error codes.
- Allow consent revocation and deletion at any time.

## Review triggers

Review or disable the adapter if Codeforces changes the endpoint, blocks the
request, changes the public response, prohibits this use, or requires
authentication. Revisit this decision before adding automatic polling, rating
history, private activity, source-code data, or submission details beyond the
minimal evidence fields.

## References

- [Codeforces API methods](https://codeforces.com/apiHelp/methods)
- [Codeforces API objects](https://codeforces.com/apiHelp/objects)
- [ADR 0002: Public provider profile statistics](0002-public-provider-profile-statistics.md)
- [ADR 0003: Provider verified activity deferral](0003-provider-verified-activity-deferral.md)
