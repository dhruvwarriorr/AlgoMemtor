# Shared Contracts

`@algomemtor/shared-contracts` contains runtime-validated request and response
contracts shared by the AlgoMemtor web app, MSW mocks, and core API.

## External-problem contract

The package uses an external metadata model. Its schemas cover:

- provider keys;
- provider-owned external IDs;
- titles and canonical outbound URLs;
- provider-native and normalized difficulty;
- provider tags and normalized topics;
- permitted public statistics;
- metadata freshness and provider availability;
- catalog queries with validated rating ranges, pagination, and provider warnings;
- recommendation reasons; and
- the three question statuses: `unsolved`, `attempted`, and `solved`.

The target contract must not contain:

- problem statements;
- examples or constraints;
- starter code;
- visible or hidden tests;
- code drafts;
- submissions; or
- judge verdicts.

Example usage:

```ts
import {
  ExternalProblemCatalogResponseSchema,
  type ExternalProblemCatalogResponse,
} from '@algomemtor/shared-contracts'

const result = ExternalProblemCatalogResponseSchema.safeParse(
  await response.json(),
)

if (!result.success) {
  throw new Error('The external problem catalog response is invalid')
}

const catalog: ExternalProblemCatalogResponse = result.data
```

## Boundary rule

Provider-specific raw DTOs do not belong in this package. They remain inside
their Express provider adapter. Shared contracts describe AlgoMemtor's normalized
API only.

## Learner-profile contract

`learner-profile.ts` validates the editable answers from the Week 8 onboarding
questionnaire: experience, difficulty comfort, goal and optional target, topic
focus, practice availability, platform preferences and optional standings,
learning preferences, and optional planning notes.

Practice-platform preferences are intentionally separate from `ProviderKey`.
They can record that a learner uses or is interested in a platform without
claiming that AlgoMemtor currently has an approved integration for it. Provider
linking, credentials, later diagnostic questions, and recommendation feedback
are outside this profile contract.

## Commands

```bash
npm run typecheck
npm run build
npm test
```

## problem-catalog.ts

    ├── validates request query parameters
    ├── validates individual problem objects
    ├── validates topic and provider objects
    ├── validates complete API responses
    ├── validates API error responses
    └── provides TypeScript types

## learner-profile.ts

    ├── validates first-time onboarding answers
    ├── separates selected topics from automatic topic suggestions
    ├── validates optional platform ratings and rankings
    ├── permits onboarding without a linked or selected platform
    └── provides save-request, stored-profile, and response types
