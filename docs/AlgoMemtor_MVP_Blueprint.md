# AlgoMemtor: AI-Guided External Problem Discovery

## Scalable MVP Product and Technical Blueprint

This blueprint defines the approved MVP direction. If older source code or
historical notes describe an internal problem workspace, Monaco, stored problem
statements, hidden test cases, or Judge0, this document takes precedence for
future work.

---

## 1. Executive Summary

AlgoMemtor is a personalized learning companion for Data Structures and
Algorithms, competitive programming, and coding interviews. It learns what a
user wants to improve, fetches problem metadata from supported external-platform
APIs, ranks appropriate candidates with AI, explains each recommendation, and
redirects the user to the original platform.

AlgoMemtor is a discovery, planning, and mentorship layer. The source platform
continues to own the complete problem statement, examples, constraints, code
editor, compiler, test cases, submissions, verdicts, and authoritative solve
history.

The MVP uses:

- React and Vite for the web application;
- Express and TypeScript for core product APIs and provider integrations;
- FastAPI and Python for recommendation ranking and learner intelligence;
- PostgreSQL for user-owned data and permitted normalized metadata;
- pgvector only when semantic learner-memory retrieval becomes useful;
- Supabase Auth for identity; and
- official or explicitly permitted external problem APIs.

There is no embedded Monaco editor and no Judge0 integration.

---

## 2. Product Vision

### 2.1 The problem

Learners waste time moving between large problem libraries without knowing:

- what to solve next;
- whether a problem matches their current ability;
- how a problem connects to a weak topic or goal;
- when to revise an older skill; or
- how to build a balanced routine across platforms.

Existing platforms are excellent places to read, code, submit, and receive
verdicts. AlgoMemtor should complement them instead of duplicating them.

### 2.2 The solution

AlgoMemtor builds a learner profile from explicit goals and trustworthy activity
evidence. It then:

1. requests fresh metadata from supported provider adapters;
2. normalizes provider-specific fields into one internal contract;
3. applies deterministic eligibility and safety filters;
4. asks the AI service to rank the remaining candidates;
5. displays transparent recommendation reasons; and
6. opens the selected problem at its canonical external URL.

The AI does not invent problem URLs, scrape webpages, or decide which provider
hosts are safe. Those responsibilities stay in deterministic backend code.

### 2.3 Target users

- Beginners who need a structured next step.
- Intermediate learners preparing for interviews.
- Competitive programmers targeting specific topics and ratings.
- Returning learners who need revision and consistency.

---

## 3. MVP Scope

### 3.1 Essential features

1. Registration, login, and onboarding.
2. Learner goals, experience, preferred providers, topics, and difficulty range.
3. Provider adapter interface and one production provider integration.
4. Normalized external problem metadata catalog.
5. Search and filters for source, topic, difficulty, and learner status.
6. AI-ranked recommendations with concise reasons.
7. Canonical outbound links with provider attribution.
8. Bookmarks, dismissed recommendations, outbound-open history, and manual
   completion status.
9. Optional linked-provider activity where an official API and user consent allow
   it.
10. Recommendation history and basic progress based on clearly labelled evidence.
11. Loading, empty, stale, provider-error, AI-error, and retry states.

### 3.2 Explicitly excluded

- Storing or rendering full external problem statements.
- Storing examples, constraints, starter code, editorials, or test cases.
- Monaco or any embedded code editor.
- Compiling or executing learner code.
- Judge0 or a custom judge.
- Storing drafts, source code, submissions, or verdicts.
- Scraping HTML or using undocumented/private provider APIs.
- Marking a problem solved merely because the user opened it.
- Real-time contests, duels, payments, and marketplaces.

### 3.3 What may be cached

The core service may cache provider-permitted metadata:

- `provider`;
- `externalId`;
- `title`;
- `canonicalUrl`;
- provider difficulty/rating;
- normalized difficulty;
- provider tags and normalized topics;
- public solve/acceptance statistics when supplied;
- availability; and
- `fetchedAt` and `expiresAt`.

It must not cache the statement or any content required to solve the problem.

---

## 4. Primary User Experience

### 4.1 Routes

| Route              | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `/`                | Product introduction                                     |
| `/login`           | Authentication                                           |
| `/onboarding`      | Goals, level, topics, and provider preferences           |
| `/dashboard`       | Recommended next actions and recent learning activity    |
| `/problems`        | External problem discovery and filtering                 |
| `/recommendations` | AI-ranked feed with reasons                              |
| `/progress`        | Manual and provider-verified progress, clearly separated |
| `/profile`         | Learner profile and linked-provider settings             |
| `/settings`        | Privacy, provider, and recommendation controls           |

The MVP does not require an internal `/problems/:problemId` solving workspace.
A future metadata preview route may exist, but its main action must still open the
canonical source URL.

### 4.2 Problem card

Each card contains only permitted metadata:

- problem title;
- provider name and attribution;
- external rating/difficulty;
- normalized difficulty;
- tags/topics;
- public statistics when available;
- the AI recommendation reason;
- bookmark/dismiss actions; and
- a clear **Solve on Provider** link.

The link should normally open in a new tab so the learner can return to their
plan. It must use an allowlisted, server-validated HTTPS URL.

### 4.3 Completion evidence

AlgoMemtor distinguishes:

- `recommended`: AlgoMemtor suggested the problem;
- `opened`: the learner followed the outbound link;
- `in_progress`: manually reported by the learner;
- `completed_manual`: manually reported as completed;
- `solved_verified`: confirmed through a supported provider API; and
- `dismissed`: removed from the learner's active feed.

Only `solved_verified` is provider-confirmed. The UI must never blur these states.

### 4.4 AI interaction

The learner can ask for a new recommendation using requests such as:

- “Give me an easier binary-search problem.”
- “I have 30 minutes and want Codeforces practice.”
- “Recommend a graph problem slightly above my current level.”

The backend converts the request into structured criteria, fetches candidates
through provider adapters, and lets AI rank the safe candidate set. If the AI is
unavailable, deterministic sorting still produces a usable list.

Problem-specific debugging is not an MVP promise because AlgoMemtor does not own
the statement or code. A later transient help flow may accept user-provided
context without persisting provider-owned content or learner source code.

---

## 5. System Architecture

```text
React browser
    |
    +-- GET /api/problems ----------------------+
    |                                           |
    +-- POST /api/recommendations --------------|----> Express core API
    |                                           |          |
    +-- POST /api/outbound-events --------------+          +-- provider gateway
                                                           |      |
                                                           |      +-- Codeforces adapter
                                                           |      +-- future permitted adapters
                                                           |
                                                           +-- metadata cache
                                                           +-- PostgreSQL core schema
                                                           +-- FastAPI internal call
                                                                  |
                                                                  +-- candidate ranking
                                                                  +-- explanations
                                                                  +-- learner memory
```

### 5.1 React ownership

- catalog and recommendation UI;
- URL-based filters;
- safe outbound-link presentation;
- authentication-aware screens;
- explicit evidence labels; and
- error, retry, stale, and fallback states.

React must not call provider APIs directly. Doing so would duplicate
normalization, expose provider credentials, complicate rate limiting, and make
provider failure behavior inconsistent.

### 5.2 Express ownership

- authentication and authorization;
- learner profiles and preferences;
- provider adapter interface;
- provider API calls, timeouts, retries, and rate-limit handling;
- metadata normalization and topic mapping;
- canonical-URL construction and host allowlisting;
- metadata caching;
- bookmarks, recommendation history, outbound events, and progress evidence;
- deterministic candidate filtering; and
- internal FastAPI orchestration.

### 5.3 FastAPI ownership

- ranking a bounded candidate set;
- generating short recommendation explanations;
- learner-memory extraction and retrieval;
- semantic matching when justified; and
- returning structured output with confidence and reasons.

FastAPI receives normalized metadata, not complete external statements. It must
return provider keys and external IDs chosen from the supplied candidate set.

### 5.4 External provider ownership

- complete and canonical problem content;
- code editor and supported languages;
- compilation and execution;
- tests, submissions, and verdicts;
- accounts, contests, and platform-specific rules; and
- authoritative solve status.

---

## 6. Provider Integration Contract

### 6.1 Adapter interface

```ts
type ProviderKey = 'codeforces'

type ExternalProblem = {
  provider: ProviderKey
  externalId: string
  title: string
  canonicalUrl: string
  providerDifficulty?: number | string
  normalizedDifficulty?: 'easy' | 'medium' | 'hard'
  providerTags: string[]
  topics: string[]
  solvedCount?: number
  fetchedAt: string
}

type ProblemQuery = {
  search?: string
  providers?: ProviderKey[]
  topics?: string[]
  difficultyMin?: number
  difficultyMax?: number
  page?: number
  pageSize?: number
}

interface ProblemProvider {
  readonly key: ProviderKey
  search(query: ProblemQuery): Promise<ExternalProblem[]>
  getUserActivity?(externalHandle: string): Promise<ProviderActivity[]>
}
```

Production schemas use Zod at the Express boundary and equivalent Pydantic models
for FastAPI calls.

### 6.2 Initial provider

Codeforces is the reference first integration because its official API provides a
machine-readable problem set. Its `Problem` object supplies contest/problem
identifiers, name, rating, and tags; `ProblemStatistics` supplies solved count.
The adapter constructs a canonical Codeforces URL from trusted identifiers.

The official API is rate-limited, so the provider gateway must cache results,
deduplicate refreshes, and back off when the provider rejects requests.

### 6.3 Adding another provider

Before adding a provider, document:

1. the official or explicitly permitted API/feed;
2. the fields it legally permits AlgoMemtor to display and cache;
3. attribution requirements;
4. rate limits and authentication;
5. canonical URL rules;
6. whether user activity can be verified with consent;
7. deletion or refresh obligations; and
8. fallback behavior when the provider is unavailable.

If these questions cannot be answered, the provider is not enabled. Do not
replace a missing API with scraping.

---

## 7. Data Model

### Core-owned records

- users and learner profiles;
- provider-account links and consent state;
- normalized metadata cache;
- bookmarks and dismissed recommendations;
- recommendation batches and reasons;
- outbound events;
- manual progress; and
- provider-verified activity evidence.

### AI-owned records

- learner memories;
- memory evidence;
- recommendation explanations and model metadata; and
- embeddings when justified.

### Deliberately absent

- internal problem statement tables;
- problem examples or constraints;
- starter-code and test-bundle tables;
- code drafts;
- submissions and judge tokens; and
- learner source-code storage.

---

## 8. API Surface

```text
GET    /api/providers
GET    /api/problems
POST   /api/recommendations
GET    /api/recommendations/history
POST   /api/bookmarks
DELETE /api/bookmarks/:provider/:externalId
POST   /api/outbound-events
PUT    /api/progress/:provider/:externalId
POST   /api/provider-accounts/:provider/link
DELETE /api/provider-accounts/:provider
POST   /internal/ai/recommendations/rank
```

`GET /api/problems` returns normalized metadata. It never returns a statement,
starter code, or tests.

`POST /api/recommendations` returns selected candidates and reasons. It does not
return an AI-invented URL; Express attaches the validated canonical URL after the
AI response is checked.

---

## 9. Frontend-First Delivery

### Phase A — Contract and UI prototype

- define normalized metadata and provider schemas;
- create fictional metadata-only fixtures;
- mock catalog, provider failures, and AI fallback;
- build filters and problem cards;
- build safe outbound navigation; and
- test evidence labels.

### Phase B — Provider gateway

- implement the adapter interface;
- add the first official provider API;
- normalize tags and difficulty;
- add caching, timeouts, and rate-limit handling; and
- replace provider mocks without changing React contracts.

### Phase C — Learner accounts and progress

- add authentication and onboarding;
- persist preferences, bookmarks, opens, and manual status;
- optionally link a provider account; and
- clearly separate manual and verified evidence.

### Phase D — AI recommendations

- rank safe candidate sets;
- generate concise reasons;
- add learner memory with user controls;
- test deterministic fallback; and
- measure recommendation quality.

---

## 10. Testing and Quality

### Frontend

- combined filters and URL persistence;
- provider attribution and outbound-link labels;
- allowlisted links and new-tab behavior;
- loading, empty, stale, partial, and error states;
- AI fallback results; and
- distinct open/manual/verified status labels.

### Express

- provider response validation;
- normalization and topic mapping;
- canonical URL construction;
- rate-limit, timeout, retry, and cache behavior;
- rejection of unknown provider hosts;
- deduplication by `(provider, externalId)`;
- authorization for learner-owned records; and
- AI output constrained to supplied candidate IDs.

### FastAPI

- structured ranking output;
- invalid or hallucinated candidate rejection;
- explanation length and relevance;
- cold-start recommendations;
- unavailable-model fallback; and
- memory privacy controls.

### End-to-end

- onboarding to recommendation to outbound navigation;
- provider outage with cached or partial results;
- AI outage with deterministic ranking;
- manual status update; and
- provider-verified activity when supported.

---

## 11. Security, Privacy, and Compliance

- Provider credentials live only in Express.
- LLM credentials live only in FastAPI.
- Provider responses and AI outputs are untrusted input.
- URLs are constructed or validated server-side against approved HTTPS hosts.
- Redirect endpoints must not become open redirects.
- Rate-limit both public search and provider refresh operations.
- Store the least learner activity required for personalization.
- Require explicit consent before linking or polling a provider account.
- Allow users to disconnect providers and delete learner-owned history.
- Attribute every external problem to its source.
- Do not imply partnership or endorsement without permission.
- Do not scrape around an unavailable API.

---

## 12. Success Measures

- percentage of recommendation cards opened;
- percentage manually marked useful or completed;
- verified solve rate where supported;
- repeat practice days per learner;
- recommendation explanation helpfulness;
- provider API success, latency, and stale-cache rates;
- AI fallback rate; and
- number of unsafe or broken outbound URLs detected.

Clicks measure discovery, not learning success. Verified solves and deliberate
user feedback are stronger evidence.

---

## 13. Scale-Up Path

Scale only after measurement:

- add Redis when provider-cache coordination needs it;
- add a background refresh worker when request-time fetching becomes too slow;
- add more providers only after an integration review;
- add event queues only when asynchronous work becomes durable and substantial;
- add a separate vector store only if PostgreSQL plus pgvector is insufficient;
- never add a code runner unless the product direction is explicitly changed by
  a new ADR.

---

## 14. Final Architecture Decision

AlgoMemtor begins as one product with two specialized backends:

- Express owns deterministic product behavior and external-provider access.
- FastAPI owns AI ranking, explanations, and learner intelligence.
- External platforms own problems and solving.

This boundary keeps the MVP focused: AlgoMemtor helps the learner choose the
right problem; the source platform remains the place where the problem is read
and solved.

## Official reference

- [Codeforces API introduction](https://codeforces.com/apiHelp)
- [Codeforces API methods](https://codeforces.com/apiHelp/methods)
- [Codeforces API objects](https://codeforces.com/apiHelp/objects)
