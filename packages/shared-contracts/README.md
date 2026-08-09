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
- metadata freshness;
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

## Commands

```bash
npm run typecheck
npm run build
```


## problem-catalog.ts
    ├── validates request query parameters
    ├── validates individual problem objects
    ├── validates topic and provider objects
    ├── validates complete API responses
    ├── validates API error responses
    └── provides TypeScript types
