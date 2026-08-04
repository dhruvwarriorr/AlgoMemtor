# Shared Contracts

`@algomemtor/shared-contracts` contains runtime-validated request and response
contracts shared by the AlgoMemtor web app, MSW mocks, and core API.

## Problem catalog

The package currently exports the Week 4 problem-catalog schemas and the
TypeScript types inferred from them. Import schemas when parsing data at a
runtime boundary and import the corresponding types for static type checking.

```ts
import {
  ProblemCatalogResponseSchema,
  type ProblemCatalogResponse,
} from '@algomemtor/shared-contracts'

const result = ProblemCatalogResponseSchema.safeParse(await response.json())

if (!result.success) {
  throw new Error('The problem catalog response is invalid')
}

const catalog: ProblemCatalogResponse = result.data
```

The catalog uses only `easy`, `medium`, and `hard` for difficulty and only
`not_started`, `attempted`, and `solved` for learner status.

## Commands

```bash
npm run typecheck
npm run build
```
