# ADR 0001: Foundational application architecture

## Status

Accepted

## Date

2026-08-04

## Context

AlgoMemtor helps learners decide what algorithm problem to practise next. The
original project direction proposed an internal problem catalog containing full
statements, an embedded code editor, and hosted code execution. That direction
duplicates mature external platforms, creates content and test-data ownership
problems, expands the security surface, and distracts from AlgoMemtor's primary
advantage: personalized discovery and long-term learning guidance.

The revised product needs to:

- fetch problem metadata from supported external APIs;
- normalize differences between providers;
- rank safe candidates using learner context and AI;
- explain each recommendation;
- redirect the learner to the canonical source page;
- track manual and provider-verified activity honestly; and
- stay useful when AI or a provider is unavailable.

## Decision

### External platforms own problems and solving

AlgoMemtor will not store full problem statements, examples, constraints,
starter code, editorials, or test cases. It will not embed a code editor, compile
code, judge submissions, or persist learner source code.

AlgoMemtor may cache provider-permitted metadata such as external ID, title,
rating, tags, public statistics, canonical URL, and freshness timestamps.

The learner solves on the originating platform.

### Use approved provider adapters

Express will own a provider gateway with one adapter per approved platform. An
adapter validates the provider response, normalizes metadata, constructs or
validates canonical URLs, respects rate and cache policy, and returns stable
internal errors.

Only official or explicitly permitted APIs/feeds may be used. A missing API is a
reason to defer a provider, not scrape it.

Codeforces is the reference initial adapter because its official API exposes
problem identifiers, names, ratings, tags, and statistics suitable for
metadata-only discovery.

### Use React with Vite

React owns routes, accessible catalog and recommendation UI, server-state
consumption, provider attribution, and outbound navigation. Vite keeps the
frontend simple and well suited to a client-rendered application.

React never calls external provider APIs directly and never receives provider or
LLM secrets.

### Use Express for core product behavior

Express owns:

- authentication-aware product endpoints;
- learner profiles and provider preferences;
- provider adapters, caching, normalization, and rate-limit handling;
- canonical URL safety;
- deterministic candidate filtering and fallback ranking;
- bookmarks, recommendation history, and progress evidence;
- provider-account consent and activity synchronization; and
- internal calls to FastAPI.

### Use FastAPI for AI capabilities

FastAPI owns:

- ranking a bounded candidate set supplied by Express;
- concise recommendation explanations;
- evidence-backed learner memory;
- embeddings and retrieval when justified; and
- structured AI output validation.

The AI service cannot introduce an unknown candidate or arbitrary URL. Express
validates returned IDs and attaches trusted canonical URLs after ranking.

### Use one PostgreSQL database with schema ownership

PostgreSQL stores learner-owned data and permitted metadata cache:

- Prisma owns the `core` schema.
- Alembic owns the `ai` schema.
- The tools never manage the same table.

The target model deliberately excludes internal statement, draft, submission,
test-bundle, and judge-token tables.

### Keep question status simple

The data model and UI expose exactly three question statuses:

- `unsolved`;
- `attempted`; and
- `solved`.

Recommendations, dismissals, outbound opens, and evidence provenance remain
separate records. An outbound click never changes question status.

## Consequences

### Positive

- AlgoMemtor focuses on personalized guidance instead of recreating judges.
- External platforms remain authoritative for content and verdicts.
- The application does not execute untrusted learner code.
- Content storage and hidden-test maintenance are removed.
- Provider adapters isolate external API differences.
- Deterministic fallback keeps the catalog useful without AI.
- Evidence labels make progress claims more trustworthy.

### Negative

- The learner leaves AlgoMemtor to solve.
- AlgoMemtor cannot observe completion unless the learner reports it or a
  permitted provider API verifies it.
- Provider outages, API changes, and rate limits affect discovery.
- Some desirable platforms may not have a suitable official integration.
- Cross-platform difficulty and topic normalization will always be approximate.

### Constraints

- No HTML scraping or undocumented private APIs.
- No open redirect accepting arbitrary destinations.
- Canonical URLs must be constructed or allowlisted by deterministic server code.
- Provider responses and AI outputs are untrusted.
- Provider terms, attribution, rate limits, and cache rules must be reviewed.
- AI ranks only candidates supplied by Express.
- Provider linking requires consent and deletion controls.
- The application must not claim unverified activity as solved.

## Alternatives considered

### Internal problem hosting and code execution

Rejected because it duplicates external platforms and introduces problem-content,
test-data, editor, judge, and untrusted-code responsibilities unrelated to the
core recommendation value.

### Browser-to-provider API calls

Rejected because the browser is the wrong place for provider credentials,
rate-limit coordination, stable caching, response normalization, and URL safety.

### Let the LLM search the open web directly

Rejected because model-selected URLs may be hallucinated, unsafe, unlicensed, or
inconsistent. Deterministic adapters must define the candidate set.

### Scrape platforms without suitable APIs

Rejected because it is brittle and may violate provider rules. Such providers
remain deferred until permitted access exists.

### A single backend service

Viable for a smaller application, but the project keeps Express for product and
provider behavior and FastAPI for AI experimentation. The internal boundary must
remain small and authenticated.

### Separate databases immediately

Rejected because one PostgreSQL database with explicit schema ownership is easier
to operate for the MVP.

## Review triggers

Review this decision if:

- users strongly reject leaving AlgoMemtor to solve;
- a provider offers an official embeddable solving experience;
- provider-account verification becomes the dominant product workload;
- legal or provider terms require a different cache model;
- FastAPI adds operational cost without measurable recommendation benefit;
- PostgreSQL cannot meet measured cache or retrieval needs; or
- the team proposes code execution again.

Any proposal to host statements, embed an editor, or execute code requires a new
ADR covering content rights, security isolation, operational cost, and product
evidence.

## References

- [Codeforces API](https://codeforces.com/apiHelp)
- [Codeforces API methods](https://codeforces.com/apiHelp/methods)
- [Codeforces API objects](https://codeforces.com/apiHelp/objects)
