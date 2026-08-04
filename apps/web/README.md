# AlgoMemtor Web Application

This workspace contains the React, Vite, and TypeScript frontend for AlgoMemtor.

The target frontend helps learners discover externally hosted coding problems,
understand AI-generated recommendation reasons, and navigate safely to the
original provider. The provider owns the full statement, editor, compiler,
submissions, and verdicts.

## Frontend responsibilities

- application routes and responsive layouts;
- onboarding and learner preferences;
- external problem metadata cards and filters;
- provider attribution;
- AI recommendation explanations;
- bookmarks, outbound opens, and progress labels;
- accessible external navigation; and
- loading, empty, stale, partial, error, and fallback states.

The web application must not:

- call provider APIs directly;
- render copied problem statements;
- embed a coding editor or execute code;
- trust an arbitrary external URL from browser input or an LLM; or
- treat opening a link as completing a problem.

## Current implementation stage

The frontend shell and metadata-only mock contracts are in place. The visible
catalog, filters, safe outbound-link component, and live provider gateway remain
later roadmap work.

## Development

From the repository root:

```bash
npm install
npm run dev:web
```

Quality checks:

```bash
npm run typecheck:web
npm run lint
npm run format:check
npm run build:web
```

The frontend uses MSW for mock-first development. New mock problems must contain
fictional or permitted metadata only, never copied statements or test cases.

## Related documentation

- [Project documentation](../../docs/PROJECT_DOCUMENTATION.md)
- [Development roadmap](../../docs/ROADMAP.md)
- [MVP blueprint](../../docs/AlgoMemtor_MVP_Blueprint.md)
