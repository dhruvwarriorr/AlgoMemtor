# AlgoMemtor — Complete Project Documentation

**Document status:** current implementation reference
**Last reconciled:** 2026-09-22
**Repository:** `AlgoMemtor`
**Document scope:** product behavior, architecture, provider integrations,
data contracts, operations, testing, privacy, and known limitations.

This is the single maintained project document. It replaces the former roadmap,
blueprint, provider plans, and architecture decision records. The source tree
and tests remain authoritative for behavior; this document describes the intent
and the currently implemented behavior together so that mismatches are visible.

## Contents

1. [Product summary](#1-product-summary)
2. [Current implementation status](#2-current-implementation-status)
3. [Product boundaries](#3-product-boundaries)
4. [Feature inventory](#4-feature-inventory)
5. [User experience](#5-user-experience)
6. [System architecture](#6-system-architecture)
7. [Repository structure](#7-repository-structure)
8. [Shared contracts](#8-shared-contracts)
9. [Provider integrations](#9-provider-integrations)
10. [Profile, solved activity, and tags](#10-profile-solved-activity-and-tags)
11. [Synchronization and caching](#11-synchronization-and-caching)
12. [HTTP API](#12-http-api)
13. [Database model](#13-database-model)
14. [Authentication and privacy](#14-authentication-and-privacy)
15. [Recommendations, routed AI, and memory](#15-recommendations-routed-ai-and-memory)
16. [Frontend engineering](#16-frontend-engineering)
17. [Configuration](#17-configuration)
18. [Local setup and daily operation](#18-local-setup-and-daily-operation)
19. [Testing and verification](#19-testing-and-verification)
20. [Operations and troubleshooting](#20-operations-and-troubleshooting)
21. [Known limitations and next work](#21-known-limitations-and-next-work)
22. [Engineering checklist](#22-engineering-checklist)
23. [Source-traced implementation map](#23-source-traced-implementation-map)
24. [End-to-end request lifecycles](#24-end-to-end-request-lifecycles)
25. [Provider transformation details](#25-provider-transformation-details)
26. [Persistence and deletion flows](#26-persistence-and-deletion-flows)
27. [State machines and invariants](#27-state-machines-and-invariants)
28. [How to extend the project](#28-how-to-extend-the-project)
29. [Planning framework for future work](#29-planning-framework-for-future-work)

---

## 1. Product summary

AlgoMemtor is an AI-assisted learning navigator for data structures and
algorithms, competitive programming, coding interviews, and algorithmic
thinking. It learns a learner's goals and preferences, obtains normalized
problem metadata from supported platforms, filters and ranks suitable problems,
explains the recommendations, and sends the learner to the canonical provider
page.

The product loop is:

```text
learner profile
    -> provider metadata and public profile observations
    -> deterministic filters
    -> optional routed AI ranking and explanation
    -> attributed canonical provider link
    -> manual or provider-observed evidence
    -> analytics and learner memory
    -> better next recommendation

The protected Coach experience extends this loop into a persistent learning
relationship: Express builds a bounded snapshot of the learner's profile,
roadmap, activity, feedback, and approved memories; FastAPI and the configured AI provider
returns validated teaching, hints, evidence references, and optional actions.
The coach never executes code, submits problems, or writes learner data without
an explicit confirmation.
```

AlgoMemtor is a discovery, planning, analytics, and mentorship layer. The
external platform remains authoritative for the complete statement, editor,
compiler, hidden tests, submissions, verdicts, and account ownership.

### Core principles

- Provider ownership is visible through attribution and canonical links.
- React talks to the Express API, never directly to external providers.
- Provider responses, HTML, GraphQL, and AI output are untrusted input.
- Deterministic filtering and ranking remain usable when AI is unavailable.
- A versioned deterministic topic assessment remains authoritative for roadmap
  placement; AI explains it but does not assign mastery.
- Manual roadmap statuses take precedence over assessments and are visible as
  learner-controlled lanes.
- Aggregate statistics are never presented as individual solve evidence.
- Partial, stale, blocked, and unavailable data are labeled honestly.
- User source code, passwords, session cookies, CSRF tokens, and CAPTCHA
  artifacts are never collected or stored.
- Transient pasted code and copied problem context are processed for one coach
  request only and replaced by an omission marker in saved conversation history.
- Opening an outbound provider link is navigation only and does not create a
  learner action or change problem status.

---

## 2. Current implementation status

The following capabilities are implemented in the current working tree:

| Area                                                        | Status                           | Notes                                                                                                                              |
| ----------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| React/Vite application shell                                | Implemented                      | Responsive authenticated application with protected routes                                                                         |
| Supabase email authentication                               | Implemented                      | JWT verification is owned by Express and FastAPI                                                                                   |
| Learner onboarding/profile                                  | Implemented                      | Goals, experience, topics, difficulty, platforms, preferences                                                                      |
| Codeforces catalog                                          | Implemented                      | Official problemset API, normalized metadata, caching, filters                                                                     |
| CodeChef catalog                                            | Implemented                      | Provider adapter with catalog and contest support                                                                                  |
| LeetCode catalog                                            | Implemented                      | Public GraphQL/catalog strategy with validation and cache                                                                          |
| CSES catalog                                                | Implemented                      | Public `/problemset/` HTML catalog; catalog-only provider                                                                          |
| Provider account linking                                    | Implemented                      | Codeforces, CodeChef, and LeetCode public handles                                                                                  |
| Public solved totals                                        | Implemented                      | Consent-gated provider profile statistics                                                                                          |
| Codeforces activity                                         | Implemented                      | Public accepted observations with bounded completeness                                                                             |
| CodeChef activity                                           | Implemented                      | Recent public submissions and accepted observations                                                                                |
| LeetCode activity                                           | Implemented                      | Bounded recent submissions and accepted observations                                                                               |
| Provider problem tags                                       | Implemented                      | CodeChef/LeetCode recent observations; profile aggregate tags for LeetCode                                                         |
| Unified activity                                            | Implemented                      | Submissions, solves, ratings, and contest participation                                                                            |
| Unified analytics                                           | Implemented                      | Provider totals, difficulty, topics, language, rating, contests                                                                    |
| Unified contests                                            | Implemented                      | Codeforces, CodeChef, and LeetCode contest adapters                                                                                |
| Manual progress                                             | Implemented                      | `unsolved`, `attempted`, `solved`, reflections, timers                                                                             |
| Bookmarks and dismissals                                    | Implemented                      | Owner-scoped persistence and recommendation actions                                                                                |
| Deterministic recommendations                               | Implemented                      | Validated candidate set and stable fallback                                                                                        |
| Routed AI ranking                                           | Implemented behind configuration | Local/OpenRouter adapter, structured output, validation, fallback                                                                  |
| Learner memory/RAG                                          | Implemented behind configuration | FastAPI memory generation, retrieval, audit, deletion                                                                              |
| Personalized CP/DSA coach                                   | Implemented locally              | Protected `/coach`, saved conversations, hybrid learner/knowledge/web retrieval, progressive teaching, validated action proposals  |
| Coach RAG v2 rich responses                                 | Implemented locally              | Versioned knowledge index, conditional public grounding, deterministic charts/metrics/timelines/problems, persisted rich snapshots |
| Adaptive improvement roadmap                                | Implemented locally              | `topic-assessment-v1`, manual status precedence, prerequisite graph, capped optional problem sets                                  |
| In-app coach check-ins                                      | Implemented locally              | Weekly local review and event thresholds with frequency caps and deduplication                                                     |
| Background provider sync                                    | Implemented                      | PostgreSQL jobs, leases, cooldowns, hourly linked-user schedule                                                                    |
| Authenticated full historical LeetCode/CodeChef/CSES import | Not implemented                  | Requires an approved API, local connector, or user import                                                                          |

Most local type-check, build, lint/format, and mocked integration checks pass
with the documented commands. The current verification exception is recorded
in the continuation handoff below. Live provider behavior and authenticated
browser acceptance still depend on the operator's network, environment,
database, and Supabase project.

### Continuation handoff — 2026-09-22

The current checkout was reconciled at `main` commit `f38aa81` and was clean
before this documentation-only update. The latest implementation work that a
future contributor should preserve is:

- Progress analytics use dated manual/provider evidence for the local 30-day
  window, count unique newly solved provider identities, and keep all-time
  status inventory separate. The Progress page no longer renders the activity
  history feed or redundant charts.
- Outbound-open tracking is retired. The old `opened` action rows remain only
  for database compatibility; no new open endpoint or UI event should be
  reintroduced as solve evidence without a new product decision.
- Coach AI fallback is intentionally learner-facing unavailable status. When
  FastAPI returns a fallback, the system does not save fabricated advice,
  rich content, action proposals, or a learner-memory job for that turn.
- Coach turns accept one transient attachment up to 8 MiB (supported image,
  document, audio, or video types). Raw attachment data is sent only for that
  request and is represented by an omission marker in saved history.
- Linking a provider queues an initial sync immediately. Scheduled linked-user
  sync runs hourly with jitter, while manual refresh has its own cooldown. The
  provider worker must be running for queued profile/activity data to appear.

The current static verification snapshot is: JavaScript/TypeScript type-check,
web lint, web formatting, and the full production build pass; the web suite
passes with 63 tests, the core suite passes with 253 tests and 10 skips, and
the AI suite passes with 98 tests and 1 skip. The full JavaScript test command
is not green because one shared-contract fixture in
`packages/shared-contracts/tests/progress.test.ts` omits the required
`data.topicActivity` array; the failure is a test-fixture/schema synchronization
gap, not a runtime failure observed by this documentation pass. Fix that
fixture, rerun `npm run test`, and then repeat `git diff --check` before making
claims about a fully green suite.

Live provider quality/cost/latency, provider behavior, authenticated Supabase
browser flows, worker restart behavior, production migrations, accessibility/
performance, and deployment remain release gates. Local tests and builds do not
prove those conditions. Never copy real API keys or other environment secrets
into this document or a handoff note.

---

## 3. Product boundaries

### AlgoMemtor owns

- learner account and onboarding preferences;
- normalized provider metadata and permitted public profile observations;
- provider freshness, completeness, source, and extraction provenance;
- catalog filters and deterministic recommendation rules;
- optional bounded AI ranking and explanations;
- personalized CP/DSA coaching, deterministic topic assessment, and a
  persistent improvement roadmap;
- bookmarks, dismissals, manual statuses, reflections,
  timers, analytics, and learner memory;
- data deletion, consent, stale-state presentation, and operational controls.

### External providers own

- full problem statements and official examples;
- code editors, compilers, judging runs, hidden tests, submissions, and
  verdicts (the Test Case Visualizer only replays the learner's own code on
  the learner's own input, in the browser; see 4.14);
- canonical contest pages and official rankings;
- account ownership and private/authenticated data;
- provider-specific taxonomy and native difficulty/rating semantics.

### Explicitly excluded

- copying premium or private problem material;
- an embedded Monaco editor, an IDE, or any server-side code runner (the Test
  Case Visualizer runs learner code only inside the learner's browser; see the
  decision in 4.14);
- Judge0 or internal judging;
- learner source-code, drafts, tests, or submission storage;
- collecting provider passwords, bearer cookies, or CSRF tokens, or sending raw
  private API responses to the server (the browser connector in section 9.5
  sends only normalized records of the learner's own history);
- CAPTCHA solving, proxy rotation to evade controls, fingerprint spoofing, or
  browser automation intended to defeat a block;
- fabricating solved problems from an aggregate total;
- cross-platform deduplication of supposedly equivalent problems;
- treating a public handle as verified ownership;
- automatic submission or execution on a provider.

When a provider returns a login wall, CAPTCHA, paywall, persistent `403`, or
malformed response, the affected capability becomes unavailable or stale. The
system does not attempt to defeat the control.

---

## 4. Feature inventory

### 4.1 Authentication and account lifecycle

- Email/password registration and login through Supabase Auth.
- Protected frontend routes and authenticated API requests.
- Cryptographic JWT verification in Express and FastAPI.
- One refresh retry after an expired frontend token, then local session expiry.
- Logout and auth-aware navigation.
- Learner-owned data deletion controls.

### 4.2 Onboarding and learner profile

The onboarding form captures:

- experience level;
- learning goal;
- comfortable difficulty;
- up to five broad preferred topics or automatic topic suggestions;
- preferred providers;
- learning preferences;
- additional considerations;
- a saved recommendation preference note;
- timezone; and
- optional public provider handles with explicit public-sync consent.

The structured choices are authoritative for deterministic ranking. Free-form
notes are optional context and are bounded before they can reach AI.
Settings presents the recommendation preference and other practice
considerations in one editable note. The existing two bounded profile fields
remain in the API so previously saved notes stay available.
Onboarding and Settings share the same compact major-topic picker. The broader
internal topic taxonomy remains valid for provider normalization,
recommendations, progress, and previously saved profile selections.

### 4.3 Unified problem discovery

The Problems page uses the database-backed normalized catalog and supports:

- provider selection: All, Codeforces, CodeChef, LeetCode, or CSES;
- text search;
- topic filtering;
- normalized difficulty filtering;
- native rating bounds where available;
- learner status filtering;
- pagination;
- provider attribution;
- canonical outbound links; and
- loading, empty, stale, partial, rate-limited, and error states.

Problem identifiers are always paired with a provider. A Codeforces ID can never
be used as a LeetCode or CodeChef ID.

### 4.4 Problem detail

Problem detail resolves a validated `(provider, externalId)` pair and displays
the metadata and provenance that the provider capability allows. Public/free
content may be sanitized and cached only when the configured provider strategy
supports it and the deployment review permits it. Premium/private material is
represented by metadata and a provider link only.

The page can show provider tags, normalized topics, difficulty, rating, status,
freshness, and source attribution. “Solve on provider” navigates to the trusted
canonical URL without recording an open event.

### 4.5 Recommendations

The recommendation flow:

1. loads the authenticated learner profile;
2. obtains a bounded provider catalog snapshot;
3. applies deterministic filters for status, difficulty, topics, and provider;
4. sends at most the configured candidate limit to FastAPI when AI is enabled;
5. validates returned candidate IDs against the supplied set;
6. attaches canonical URLs from Express-owned provider data; and
7. persists the recommendation batch and item explanations.

AI cannot add an unknown problem, URL, provider, or learner status. If AI is
unavailable, deterministic ranking remains the visible fallback.

**Learner signals (`recommendation-signals.ts`).** Before shortlisting, Express
derives bounded (at most eight each) canonical topic lists from the learner's
own data: `roadmapFocusTopics` (manual `working_on`, then the roadmap's
`current_focus`, then `revisit` topics), `weakTopics` (roadmap
`needs_practice`/`needs_more_practice` topics, then topics where at least two
observed attempts mostly did not end in a solve), and `underPracticedTopics`
(next-up roadmap topics with `insufficient_evidence`). Skipped, completed, and
excluded topics never appear. They are merged, after any explicitly selected
profile topics, into the deterministic focus list, so the 40-candidate
shortlist the AI reorders already contains plan, weak, and thin-topic problems.
Catalog tags are canonicalized (`dp` → `dynamic-programming`) before matching.
A `contestSummary` (rated contests in the last 90 days, current rating, 90-day
change, and a rising/steady/falling trend) is computed from stored rating
changes. When the learner lets AlgoMemtor decide difficulty and set no explicit
range, the rating band is centred on their latest observed Codeforces rating
(−100/+200) instead of the onboarding estimate.

The signals, the calibrated band, and the merged focus list reach the AI ranker
under the current always-on `personalized-coaching-rag-v2` policy. FastAPI
additionally retrieves the learner's active memories, including instructions
such as a topic to focus on or set aside, topic weaknesses, and difficulty
patterns, and is told to honor them, favoring stated
focus and placing set-aside topics last. Hard exclusions still come only from
confirmed actions: `skip_for_now` statuses (for example accepted from a coach
proposal) and explicit profile exclusions.

**Daily rotation.** A saved batch is reused only on the same calendar day in
the learner's coach time zone (UTC by default). The first request on a new day
generates a fresh batch that prefers problems not shown recently. Evidence,
feedback, profile, consent, memory, and roadmap-refresh changes still
invalidate the batch immediately. Generation is lazy (on first view of the
day), so inactive learners cost no model calls.

### 4.6 Progress and evidence

Learner problem status has exactly three values:

- `unsolved`;
- `attempted`; and
- `solved`.

Manual status changes, provider-observed accepted activity, recommendation
actions, bookmarks, dismissals, and reflections are separate
facts. A provider observation can be partial and bounded; it must not be
presented as proof of account ownership.

The Progress page's 30-day overview uses dated manual status changes and
available provider submissions/solved observations. "Problems practiced" counts
only unique problems newly solved in the learner's local 30-day window, rather
than the all-time manual status inventory. Daily columns show newly solved
problems, and practice signals use days with solves plus completed timers in
that window. Topic charts count recognized tags on those recent solves; one
problem can contribute to multiple topics. The page does not display the
activity-history feed.

Decision (2026-09-22): outbound-open tracking is retired. A click is neither a
learner status nor reliable practice evidence, and showing it as activity was
confusing. Links remain ordinary safe anchors. Existing `opened` rows are
retained for historical database compatibility but are excluded from public
history, coach suggestion state, and progress analytics; the write endpoint is
removed. Reconsider only if a separate, opt-in navigation metric is needed.

### 4.7 Unified profile

The Profile page presents:

- latest solved totals by connected provider;
- combined total as an arithmetic sum, without cross-platform deduplication;
- ratings and ranks when reported;
- freshness and completeness;
- linked and archived identities;
- provider profile snapshots;
- consent and disconnect controls; and
- data deletion controls.

### 4.8 Unified activity

Activity is a chronological, provider-attributed timeline containing:

- submissions and verdicts;
- accepted-problem observations;
- provider tags and normalized topics when available;
- language and timestamps;
- rating changes; and
- contest participation.

The UI can filter by provider and event type. Bounded provider windows are
marked partial rather than silently treated as complete history.

### 4.9 Unified contests

The Contests page combines upcoming and historical provider contests with:

- provider and contest filters;
- start/end times and local-time rendering;
- contest status and rated flag;
- participation rank/score where available; and
- rating changes where available.

### 4.10 Analytics

The dashboard's last-30-local-days cards and progress trend count distinct
dated problem identities from learner status events and stored provider
submissions/solved observations. The first observed solve date per provider
problem determines whether it is a new solve in the window; repeated accepted
submissions and matching solved observations do not inflate the count. Undated aggregate profile totals
do not establish when a problem was solved and are excluded from this window;
all-time status inventory remains separate. Recent dashboard activity reads the
unified provider timeline rather than only learner status history. Provider
sync completion invalidates the dashboard analytics cache.

Analytics includes:

- total solved and provider breakdown;
- solved-over-time observations;
- normalized difficulty distribution;
- curated topic distribution from recognized provider tags;
- language usage;
- recent-window acceptance rate;
- combined contest participation and rating history. The Insights view shows
  the six most recent entries first (three rows in the two-column layout) and
  expands to the remaining history on demand; rated contests show the
  provider-reported signed rating delta.

LeetCode profile-side `tagProblemCounts` is used for the complete aggregate
skill distribution returned by its public profile. Concrete recent solved rows
are not added again for that provider, preventing double-counting. For
providers without aggregate topic counts, concrete observed problem metadata is
used. The analytics API maps Codeforces and LeetCode tags into a fixed set of
broader learning areas on every read. Unknown, untagged, and provider-specific
contest labels (including CodeChef START codes) do not create chart topics.
Multiple native tags for one observed problem that map to the same area count
once. The Insights page shows the largest areas in a compact pie chart, groups
the remaining recognized areas as `Other topics`, and offers the full recognized
breakdown in an expandable table. Codeforces accepted submissions carry their
public problem tags into persisted solved observations during sync, so newly
observed solves can contribute without a catalog lookup; LeetCode's refreshed
profile aggregate supplies its topic distribution.

### 4.11 Bookmarks, dismissals, reflections, and timers

- Bookmarks are learner-owned and provider-scoped.
- Recommendation impressions and feedback are persisted separately.
- Dismissed recommendations can be restored.
- Reflections attach learner notes to a provider problem.
- Timer sessions support start, pause, resume, and resolve.
- These features never store submitted source code.

### 4.12 Learner memory

The AI service can generate bounded memory signals from eligible learner data.
Memory has confidence, evidence strength, lifecycle actions, retrieval limits,
and delete/archive/restore controls. The learner can inspect and manage memory.
The Memory page also accepts learner-written guidance ("I prefer short hints
before full explanations") in a steering-bar style input. It is stored as an
active `user_instruction` memory without a model call.

### 4.13 Mentor tools outside the Coach chat

The Coach is a chat. Problem-specific help, solution exploration, upsolving,
contest analysis and progress evaluation each have a dedicated section. Every
mentor call receives a bounded learner snapshot (experience, goal, learning
preferences, latest ratings, topic-assessment evidence, and up to eight active
learner memories) so hints and reports are calibrated to the learner. Memories
are retrieved by vector and keyword similarity to the request (the problem,
doubt and question) rather than taken by confidence alone.

- **Doubt Helper** (`/doubt-helper`, `/doubt-helper/:sessionId`). Intake:
  problem link (Codeforces, CodeChef, LeetCode, CSES, or any public page) or a
  problem name plus pasted statement; language; one of eight doubt types
  (understand the problem, find an approach, check my approach before
  submitting, compilation error, no output, wrong answer, TLE/MLE, general); a
  short attempt summary; transient code and compiler/verdict text. Hints follow
  a five-level ladder: nudge, concept, structure, key code (at most 25 lines),
  full walkthrough. Debugging doubts start with a diagnosis that names a bug
  category (logic error, edge case, off-by-one, overflow, wrong algorithm,
  complexity, memory, compilation, I/O, undefined behavior). The full
  walkthrough requires `request_solution` then `confirm_solution`; Express
  enforces `hintLevel >= 1` and the confirmation stage, and FastAPI repairs or
  withholds code that exceeds the locked disclosure level. Sessions use
  optimistic `expectedVersion` checks so double clicks cannot skip levels.
  A link is
  enough: when the provider adapter cannot read the statement (for example
  Codeforces answering server requests with a bot challenge), the AI service
  reads the public page itself (see the decision below) and, as a last resort,
  looks the statement up with web search. Only when all of that fails does the
  helper ask for the pasted statement. "Ask a question" and "I tried this"
  live in a bottom-right mentor panel that already has the session context.
- **Solution Explorer** (`/solutions?problem=`). Opens after the learner solved
  or attempted the problem (provider evidence or manual status), worked on it
  in the Doubt Helper, or explicitly confirms a genuine attempt. A link is
  enough (an optional pasted statement is accepted when a page cannot be read).
  The page shows: an explanation of the problem (restatement, input/output and
  the constraints that matter, key observations, a sample walkthrough, edge
  cases); exactly three approaches ordered brute force, better (or a genuinely
  different method), optimal, each with idea, key insight, algorithm steps,
  correctness argument, limitations, complexity, a complete program in the
  chosen language and a code walkthrough; trade-offs; transferable lessons; the
  official editorial; and the top three community solutions in the chosen
  language. Programs that are skeletons (placeholder comments, empty loops, too
  little logic) are rewritten once by a targeted repair call and hidden if they
  are still not real code. The Codeforces editorial link is resolved from the
  contest page's "Tutorial" link and the relevant section of the editorial
  grounds the optimal approach. Community solutions come first from the
  platform's own public API (Codeforces `contest.status`: the fastest accepted
  submissions in that language, one per author; LeetCode: the most-voted
  solution posts tagged with that language), then from OpenRouter web search
  with the `parallel` engine, ranked by how
  specific each hit is to the problem and language. A bottom-right assistant
  answers follow-up and cross questions with the cached page as context
  (`POST /api/solutions/chat`; the conversation stays in the browser).
  Explorations are cached per learner, problem and language; explorations
  written before the problem explanation existed are regenerated.
- **Contests the learner took part in** (Upsolve and Contest Analysis) come
  from the rating history plus, for Codeforces, contests found from the
  learner's own submissions: live rounds without a rating change (Div. 3/4
  above the rating limit, out of competition) are marked "Live, unrated", and
  contests worked on within three weeks after they ended are marked "Practised
  after" (Upsolve only; Contest Analysis skips them because there is no
  in-contest timing). `GET /api/upsolve?refresh=true` and
  `GET /api/contest-analysis?refresh=true` first pull the learner's newest
  platform data (bounded to 35 s). Cold CodeChef/LeetCode contest lists are
  fetched for the ten most recent contests; a CodeChef division lookup stops
  once every submitted problem is found.
- **Upsolve Tracker** (`/upsolve`). Uses the learner's last 12 matched
  contests with their full problem lists: Codeforces from the catalog, CodeChef
  from the public contest API (the Starters division whose problems the learner
  submitted to, scored problems ordered by solves), LeetCode from the public
  `contestQuestionList` GraphQL query. Lists are cached for six hours, and the
  mentor service keeps every list that loaded for the life of the process (a
  finished contest's problems never change), so a platform timeout cannot
  empty a contest. "Up next" always holds five problems. A fresh queue follows
  a fixed rule: the first two unsolved problems of each contest, newest contest
  first. Problems then stay
  in place until solved or skipped (the queue restarts from the rule when a
  newer contest appears); each freed slot is filled at the bottom by
  the AI mentor (`POST /internal/mentor/upsolve-pick`), which chooses among the
  top-two unsolved problems of every contest, so the queue holds at most two
  open problems of one contest; only when those run out does the latest
  contest offer its next two (score order when the AI is unavailable). A
  fresh queue is filled the same way. Candidate scores
  combine recency (e^(-days/30)), rating fit (a Gaussian around rating + 100,
  sigma 300), contest attempts and the top-two position. The queue order is
  stored in `core.mentor_reports` (`upsolve_queue`, version 5); a queue built
  while a recent contest's problem list is missing is shown but never stored,
  because that contest's queued problems would only look finished. Every row
  can be marked solved on every platform (`upsolve_item_states.state =
  'solved'`; Codeforces and CodeChef also record a self-reported progress
  status). The charts (per-contest solved during it, upsolved after and still
  open; follow-through; upsolved by platform, with every linked platform
  listed) and the summary totals cover contests from the last 30 days
  (`UPSOLVE_CHART_WINDOW_DAYS`, sent as `summary.windowDays`); the queue and
  contest cards still use every recent contest. "Latest contests" shows the
  most recent contest on each platform; opening it lists all of its problems
  with their status. A problem is upsolved only when it was solved after the
  contest ended and outside the learner's own sitting (the live contest, or the
  first practice session of a contest practised after it ended): an accepted
  submission, a timestamped solved observation or status, or "Mark solved".
  Solve evidence from before or during the sitting, or without a time, counts
  as already solved. There is no revision schedule and there are no
  reminders.
- **Contest Analysis** (`/contest-analysis`). Contests are matched to the
  provider schedule (Codeforces ID, LeetCode slug, name/number tokens, or a
  unique time window). Metrics come from submission timestamps inside the
  contest window: per-problem attempts, wrong attempts, solve minute and time
  spent, problem switches away from unsolved problems, longest gap, idle tail,
  first accepted minute and rapid wrong resubmits (within three minutes).
  Cross-contest patterns count slow starts, early stops, rapid-resubmit
  contests, rating drops, recurring unsolved topics and stuck positions. An
  optional AI narrative (per contest and across contests) explains panic
  signals, time management, weak topics, rating-change causes and strategy.
  Non-Codeforces contests list only submitted problems and say so.
- **Progress Report** (`/progress/report`). Deterministic topic progress,
  weekly first-attempt accuracy, consistency and streaks, contest solving speed
  by difficulty band (earlier vs recent medians; live contests only, since a
  practice sitting's clock starts at its first submission), rating trajectory with a
  per-contest slope and 90-day projection, and Doubt Helper hint dependency.
  Evidence-based insight statements link to the relevant section. An optional
  weekly AI insight report interprets the same numbers.
#### Decision: mentor tools are separate sections; the Coach is chat-only (2026-09-24)

Context: the Coach answered "help me with <problem link>" with the full key
observation and code, while contest analysis and progress questions competed
with open-ended chat. Decision: each dedicated capability has its own page and
server-owned state; a deterministic router in Express
(`coach-feature-routing.ts`) answers clear requests for those capabilities in
the chat with a `feature_redirect` rich block and no model call, carrying only a
validated public problem URL. Concept questions stay in the chat. Alternatives
considered: a Coach sidebar Doubt Helper (the earlier plan) and model-side
routing; both keep disclosure decisions inside the chat model. Consequences:
hint disclosure is enforced in Express and FastAPI rather than by prompt alone;
learner code, compiler output and pasted statements remain transient; cached AI
reports live in `core.mentor_reports`. Review if a provider starts permitting
contest editorials through an API, or if chat-based problem help is requested
again.

#### Decision: mentor tools read any linked page, with a reader fallback (2026-09-25)

- **Context:** the project owner requires every mentor tool to work from a
  link alone, the way chat assistants read pages. Codeforces answers
  server-side requests (the adapter and the direct page reader) with a
  Cloudflare challenge, so Doubt Helper and Solution Explorer fell back to
  generic, guessed answers.
- **Decision:** the AI service reads pages through `page_retrieval.py`: a
  direct SSRF-guarded read first; when that fails or returns a challenge page,
  one read through a configured public reader service
  (`WEB_READER_PROXY_URL`, `https://r.jina.ai/` by default, optional
  `WEB_READER_PROXY_API_KEY`). The target is validated as a public https host
  before either route. Successful reads are cached in memory for
  `WEB_READER_CACHE_SECONDS` (30 minutes) so consecutive turns do not refetch.
  Page text stays transient and is never stored. When no page can be read,
  web search restates the statement and the exploration is labeled as
  search-based. Web search uses OpenRouter's hosted `openrouter:web_search`
  tool with the `parallel` engine.
- **Alternatives:** asking for a pasted statement (kept as an optional
  fallback), provider URL context (also blocked by the challenge), and a headless
  browser (rejected: heavy and it would solve challenges).
- **Consequences:** the reader service sees which public URLs are read; some
  providers' terms may restrict automated reads of problem pages. Hosted web
  search is used only after direct/provider page retrieval fails. Community
  solutions prefer the platforms' own
  public APIs for that reason.
- **Review triggers:** a provider objection, a reader-service policy change,
  before a public deployment, or any need to store fetched content.

#### Decision: personalized AI is always on (2026-09-24)

AlgoMemtor is an AI-first product, so personalized coaching and learner memory
are no longer optional. The Coach and privacy settings section and the consent
card were removed; `GET /api/ai-consent` reports the always-on policy and the
legacy `PUT` rejects `enabled=false`. Learners still control memory through the
Memory page (correct, archive, delete, add) and full data reset.


### 4.14 Test Case Visualizer

`/visualizer` runs the learner's own C++, Java or Python program on a test
input they provide, records every step and draws it: the program's own
arrays, pointers, stacks, queues, heaps, maps, sets, graphs, trees, linked
lists, grids, 3D tables and recursive calls move as the code runs. The trace
always comes from running the code. An optional AI Debugger (below) explains
a recorded run on request; it never produces the trace.

- **Where code runs.** Only in the learner's browser, in a dedicated Web
  Worker (`features/visualizer/worker/visualizer.worker.ts`). The worker has no
  access to the session token, and removes `fetch`, `XMLHttpRequest`,
  `WebSocket`, `importScripts` and storage APIs once its runtime has loaded.
  Running never sends code anywhere. Code, input and a digest of the run
  leave the browser only when the learner presses an AI Debugger action, and
  are never stored server-side; the current draft stays in this tab's
  `sessionStorage`.
- **Python** runs real CPython 3.14 through Pyodide (`pyodide` npm package,
  self-hosted under `/pyodide/<version>/`, never from a CDN). The tracer
  (`engines/python/tracer.py`) uses `sys.settrace` and AST analysis for
  branch/loop headers and element accesses. Imports of `js`/`pyodide` are
  blocked, `open()` only reaches standard input/output, and
  `sys.setrecursionlimit` is capped at 2,500.
- **C++** runs in a TypeScript interpreter for contest C++
  (`engines/cpp/*`): preprocessor macros and `#ifdef`, 8/16/32/64/128-bit
  integers with g++ wrap-around, `double`, strings, C arrays, `vector`,
  `deque`, `stack`, `queue`, `priority_queue`, `map`/`set` (ordered, unordered
  and multi), `pair`/`tuple`, structs with methods, constructors and
  operators, lambdas (including recursive ones), templates as `auto`,
  iterators, `<algorithm>`, `cin`/`cout` formatting, `scanf`/`printf` and
  `getline`, pointers to structs and arrays (`new`/`delete`, `nullptr`,
  `->`, linked nodes; following a null pointer stops the run), `try`/`catch`
  and `throw`. Unsupported features (pointers to pointers, inheritance,
  namespaces, random engines) stop with a clear "not supported" message and
  line. Undefined behaviour that would corrupt a real run is
  reported instead of hidden: an out-of-range index stops the run with the
  index, size and valid range; signed overflow, unsigned wrap-around,
  narrowing conversions and reads of unset locals are step warnings.
  Recursion is executed with generators and an explicit call stack, so depth
  is limited to 20,000 calls rather than by the JavaScript stack. Unordered
  containers iterate in insertion order, and `long` is 64-bit (LP64).
- **Java** runs in a TypeScript interpreter built on the C++ one
  (`engines/java/*`) for single-file Java 21: classes, static nested classes,
  interfaces with default methods, inheritance with `super`, enums, records,
  generics, `instanceof` patterns, lambdas, method references, anonymous
  classes, labelled `break`/`continue`, arrow `switch`, exceptions with their
  Java class hierarchy (`try`/`catch`/`finally`, `throw`, uncaught exceptions
  and `StackOverflowError`), reference semantics, 32/64-bit wrap-around,
  `String`/`StringBuilder`, `Scanner`, `BufferedReader`/`StringTokenizer`,
  `PrintWriter` (unflushed output is lost and warned about), `Math`,
  wrappers, `Arrays`, `Collections`, `ArrayList`, `LinkedList`, `ArrayDeque`,
  `Stack`, `PriorityQueue` (Java's heap layout), `HashMap`/`HashSet` (Java's
  bucket iteration order, including head insertion by `merge`/`compute`),
  `LinkedHashMap`, `TreeMap`/`TreeSet` navigation, `Comparator` combinators
  and a `Stream` subset. `Set.of`/`Map.of` use HashMap order rather than
  Java's randomised order.
- **Correctness corpus.** `engines/corpus/{cpp,java,python}` holds programs
  with inputs and the outputs real g++ 15, OpenJDK 25 and CPython 3.14
  printed; every engine must match them exactly. Every gallery example
  (`examples.ts`) is also run in all its languages by `examples.test.ts`.
- **Object identity.** All three engines give heap objects a stable
  `objectId` and record an object already being drawn as a `ref`, so shared
  nodes and cycles (doubly linked lists) are drawn once and every variable
  pointing at a node is shown as a label on it.
- **Limits.** 10,000 recorded steps (the program keeps running unrecorded so
  the final output is still correct), a 5-second run budget, 200,000
  characters of output and bounded container sizes. A worker that does not
  answer within the budget plus 8 seconds is terminated.
- **What the learner sees.** A visualization-first page
  (`pages/TestCaseVisualizerPage.tsx`, `features/visualizer/stage/*`):
  - three tabs: **Code** (the default: language, Run and Ctrl+Enter in a
    toolbar above the editor, with test input and expected output beside it),
    **Examples** (runnable programs by topic: pointers, sorting, stacks and
    queues, linked lists and trees, graphs, recursion and DP, and "find the
    bug", each in C++, Java and/or Python) and **Visualization** (enabled after
    a run, with its verdict, "Edit code & input" and "Run again" in one row);
  - a steady layout while stepping: cards and variables keep the order in
    which the variables first appeared, card width depends only on the kind of
    structure, and cards, the variable row and the card grid grow but never
    shrink during a run (`stage/sticky.ts`);
  - a narration bar per step with the program's values put into the source it
    evaluates (`a[mid] < target` → `23 < 40`, true/false, loop iteration,
    call, return, input, output, warning, error);
  - variable chips that flip when they change and pause playback when
    watched;
  - one card per structure, chosen from the recorded shape
    (`scene/build.ts`): arrays as cells or bars with sliding pointers and a
    window between pointer pairs, strings as characters, 2D grids as heat maps
    or mazes with row/column pointers, 3D arrays as an isometric cube or
    layers, stacks with a Top arrow, queues as a pipe, priority queues as their real binary heap (tree with array indexes, the backing array, min/max-heap, pushed and popped items and the order items will come out; C++ pops follow libstdc++'s `pop_heap`, so the layout matches g++), maps
    and sets, adjacency lists/matrices/edge lists as graphs (visited, current,
    neighbour, frontier and per-node values such as `dist[v]`), linked objects
    as binary trees (in-order layout), n-ary trees or linked lists, and a
    recursion tree of every call with its return value. Items keep stable keys
    across steps so a swap slides and a pop leaves (`scene/keys.ts`);
  - the code with the current line, breakpoints, hit counts and AI-flagged
    lines; consumed input, output so far and a whitespace-insensitive
    comparison with the expected output that finds the first wrong step;
  - a sticky playback bar with a scrubber marked with calls, output,
    warnings, errors, breakpoints and AI findings, speeds from 0.5 to 16
    steps a second, "only changes", and jumps. Motion respects the reduced
    motion setting.
- **AI Debugger.** A side panel (`features/visualizer/ai/*`) with "Find my
  bug" / "Check my logic" and a chat about the current step. It posts
  `POST /api/visualizer/debug` (contract `VisualizerDebugRequestSchema` in
  `packages/shared-contracts/src/visualizer.ts`) with the code, the input and
  a digest built in the browser (`ai/digest.ts`: status, error, output,
  expected output, first mismatch, warnings and up to 60 recorded moments
  with their variables, plus the step being looked at). Express forwards it to
  `POST /internal/mentor/visualizer-debug` (FastAPI, `code_debugging`
  workload), and both services drop findings whose line is outside the code
  or whose step is outside the recording. The answer has a verdict, findings
  pinned to a line and a step (hint first, the fix revealed on request),
  suggested test inputs the learner can run with one click, and follow-up
  questions. Nothing is stored or logged.
- **Doubt Helper.** Active sessions in C++, Java or Python show "Visualize a test
  case", which opens the visualizer with the session's problem and the code
  attached in that tab. From the visualizer, "Ask Doubt Helper about this
  step" opens the session's Ask dock with a question built from the recorded
  step (line, variables, output, expected output) and the code attached as
  the existing transient `transientCode`; the learner reviews and sends it.
  Without a session, "Get help with this step" pre-fills a new Doubt Helper
  intake instead.
- **Solution Explorer.** Every approach with a program in C++, Java or Python has
  "Visualize with a test case", which opens that program in the visualizer.

#### Decision: the Test Case Visualizer runs learner code in the browser (2026-09-25)

- **Context:** the project owner asked for a visualizer that executes the
  learner's code on a test case and shows each step (see
  `docs/TEST_CASE_VISUALIZER_PLAN.md`). Section 3 excluded any code runner so
  that AlgoMemtor would not become a judge or store learner code.
- **Decision:** allow execution only for visualization, only inside the
  learner's browser (a Web Worker with network APIs removed), with Pyodide for
  Python and a purpose-built interpreter for contest C++. No server endpoint
  executes code; nothing about a run is stored server-side. The judge boundary
  stays: no hidden tests, submissions, verdicts or Judge0.
- **Alternatives:** server-side sandboxes or Judge0 (a new attack surface,
  operational cost and learner code on the server), compiling C++ to
  WebAssembly (no variable-level tracing without debug-info parsing, and a
  very large download), and AI-generated traces (rejected: they can be wrong).
- **Consequences:** the C++ interpreter supports a documented subset and may
  differ from g++ where C++ leaves behaviour undefined (it reports those cases
  instead); the first Python run downloads about 13 MB, cached afterwards;
  AI-generated Solution Explorer code can be run, but only in the learner's
  own sandboxed worker.
- **Review triggers:** any request to run code on a server, to store runs or
  code, to support more languages, or a security finding about the worker.

#### Decision: Java support and an AI Debugger in the visualizer (2026-09-25)

- **Context:** the project owner asked for Java, a visualization-first page
  instead of an IDE-like one, and AI that finds where the learner's code goes
  wrong, with no project-level restrictions for this feature.
- **Decision:** Java runs in the browser like C++, as a dialect of the same
  interpreter. The AI Debugger sends code, input and a digest of the recorded
  run to the AI service only when the learner presses an AI action; it never
  runs code and never replaces the recorded trace. Code and digests are
  transient request fields, not stored or logged.
- **Alternatives:** a JVM in WebAssembly (tens of megabytes and no
  variable-level tracing), sending the full trace (too large and noisy for a
  model), or asking the model to simulate the program (rejected: it can be
  wrong).
- **Consequences:** Java covers a documented subset and HashMap order
  follows Java only for the operations simulated; AI answers are advisory and
  bounded to the lines and steps of the run.
- **Review triggers:** storing AI conversations, sending code without an
  explicit action, or supporting more languages.

---

## 5. User experience

### Public routes

- `/` — landing page and product explanation.
- `/login` — Supabase email authentication.
- `/reset-password` — recovery-link-only password update.

### Protected routes

- `/dashboard` — authenticated landing and recommendation entry point.
- `/onboarding` — learner profile setup and provider linking.
- `/problems` — unified provider catalog.
- `/problems/:provider/:externalId` — problem detail.
- `/recommendations` — ranked practice feed.
- `/coach` — chat with saved conversations, rich evidence, in-app check-ins,
  and redirect cards to the mentor tools.
- `/doubt-helper` and `/doubt-helper/:sessionId` — guided hints and debugging.
- `/solutions` — Solution Explorer.
- `/visualizer` — Test Case Visualizer (code runs in the browser only).
- `/upsolve` — upsolve queue and completion tracking.
- `/contest-analysis` — per-contest and cross-contest analysis.
- `/progress/report` — progress evaluation and insight report.
- `/contests` — contest catalog and participation with bounded “show more”
  pagination.
- `/analytics` — unified analytics.
- `/progress` — recent practice analytics and visualizations.
- `/bookmarks` — saved problems.
- `/memory` — learner memory controls.
- `/profile` — learner summary and linked public profiles.
- `/settings` — profile and goals; **Accounts** (Google connect/disconnect,
  change password after re-entering the current one, set a password for
  Google-only accounts, reset-link fallback); linked platforms; appearance;
  data reset. `/login` offers "Forgot password?" which emails a link to
  `/reset-password`.

All merged views expose provider filters and use responsive layouts. Keyboard
navigation, semantic buttons/anchors, focus visibility, and honest loading/error
states are part of the feature contract.

---

## 6. System architecture

```text
Browser (React + Vite)
  |
  +-- /api/* --> Express core API
  |                +-- Supabase JWT verification
  |                +-- provider adapters and HTTP safety layer
  |                +-- normalization, cache, filtering, URL construction
  |                +-- learner data and provider sync queue
  |                +-- coach context, roadmap assessment, action confirmation
  |                +-- PostgreSQL core schema through Prisma
  |
  +-- never calls providers directly

Express -- internal token --> FastAPI AI API
                                +-- JWT verification
                                +-- bounded local/OpenRouter ranking
                                +-- coach tutoring and validated rich JSON responses
                                +-- learner-memory and knowledge retrieval
                                +-- conditional de-identified OpenRouter web search
                                +-- PostgreSQL ai schema through Alembic

External providers
  +-- Codeforces
  +-- CodeChef
  +-- LeetCode
  +-- CSES catalog
```

### Ownership table

| Component                   | Responsibility                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web`                  | Routes, UI, auth state, URL filters, accessible interactions                                       |
| `apps/core-api`             | Authenticated product API, adapters, normalization, persistence, safe URLs, deterministic coaching |
| `apps/ai-api`               | Routed AI ranking, coaching explanations, learner memory, vector retrieval, keyed audits           |
| `packages/shared-contracts` | Runtime-validated TypeScript contracts shared by API, UI, and mocks                                |
| Prisma                      | `core` PostgreSQL schema and migrations                                                            |
| Alembic                     | `ai` PostgreSQL schema and migrations                                                              |
| Supabase Auth               | Application identity and email authentication                                                      |
| Providers                   | Statements, execution, submissions, judging, authoritative accounts                                |

Prisma and Alembic must never manage the same table or schema objects.

---

## 7. Repository structure

```text
.
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/              # providers, auth, theme, notifications
│   │       ├── components/       # layout, navigation, UI, state components
│   │       ├── features/         # auth, profile, platform, progress, memory, coach
│   │       ├── pages/             # route-level screens
│   │       ├── routes/            # router, protected routes, scroll state
│   │       └── mocks/             # normalized MSW fixtures and handlers
│   ├── core-api/
│   │   ├── prisma/                # Prisma schema and core migrations
│   │   └── src/
│   │       ├── auth/              # JWT verification and auth middleware
│   │       ├── config/            # environment parsing and feature flags
│   │       ├── database/           # Prisma client
│   │       ├── integrations/       # providers, provider accounts, AI client
│   │       ├── repositories/       # persistence and in-memory implementations
│   │       ├── services/           # product, sync, recommendation, progress, coach logic
│   │       ├── utils/              # request gates and shared utilities
│   │       ├── app.ts              # Express route assembly
│   │       └── server.ts           # HTTP server and provider wiring
│   └── ai-api/
│       ├── app/                    # FastAPI routes, services, models
│       ├── alembic/                # AI schema migrations
│       └── tests/                  # Python service and RAG tests
├── packages/
│   └── shared-contracts/           # Zod schemas and shared TypeScript types
├── docker-compose.yml              # local PostgreSQL
├── package.json                    # workspace scripts
└── README.md                       # short entry-point README
```

---

## 8. Shared contracts

The shared package is the boundary between Express, React, mocks, and tests.
Provider-specific raw DTOs remain inside adapters.

### Provider keys

```text
codeforces | codechef | leetcode | cses
```

`codeforces`, `codechef`, and `leetcode` are linkable account providers.
`cses` is catalog-only in the current implementation and cannot be linked as
an account.

### Normalized provider records

The contracts include:

- `ProviderProfile` — handle, solved count, acceptance rate, rank, rating,
  languages, aggregate topics, badges, calendar, completeness, provenance.
- `ProviderSubmission` — provider problem, event ID, verdict, language,
  timestamp, acceptance, optional runtime/memory/passed-test judge details,
  completeness, provenance.
- `ProviderSolvedProblem` — concrete provider problem, occurrence timestamps,
  source event, provider tags, normalized topics, completeness, provenance.
- `ProviderRatingChange` — contest, old/new rating, delta, percentile,
  timestamp, provenance.
- `ExternalContest` — provider contest identity, name, URL, schedule, status,
  rated flag, completeness, provenance.
- `ContestParticipation` — contest rank/score/rating fields and provenance.
- `ProblemContent` — sanitized permitted content only; never source code/tests.
- `ProviderSyncState` and job/status contracts — cursor, attempts, leases,
  freshness, retry/error state.
- `UnifiedProfile`, `UnifiedAnalytics`, and activity response contracts.

### Provenance requirements

External records carry:

```text
provider
providerId
canonicalUrl
sourceUrl
extractionStrategy
schemaVersion
completeness
fetchedAt
stale
```

The source class distinguishes official JSON, public GraphQL, embedded JSON,
sanitized HTML, and stale cache. Unknown or malformed records are skipped or
returned as partial; they are never silently converted to zero values.

---

## 9. Provider integrations

All provider access is server-side through the shared HTTP layer. Each adapter
validates payloads with Zod, constructs canonical URLs from validated IDs, uses
an allowlisted HTTPS host, applies a request gate, and maps failures to stable
provider errors.

### 9.1 Codeforces

#### Sources

- `problemset.problems` for the global catalog;
- `user.info` for profile fields;
- `user.status` for bounded public submissions and accepted observations;
- `user.rating` for rating history;
- `contest.list` and public standings for contests; and
- public problem pages only when a permitted field is unavailable through the
  official API and the capability is enabled.

#### Behavior

- Official API response envelopes and records are validated.
- Problems are normalized with rating, difficulty band, tags, statistics, and
  safe contest/index URLs.
- The existing 2.1-second request gate is preserved.
- Submission pagination records incomplete coverage when the provider window is
  exhausted.
- Only concrete accepted submissions with valid provider IDs and timestamps
  become provider activity evidence.
- Each stored submission keeps the problem title, programming language,
  runtime, memory, and passed-test count that `user.status` reports.
- After one complete fetch, the sync state stores the highest submission ID as
  a cursor. Later syncs request only the newest 200 submissions; if that window
  does not reach the cursor, the full history is fetched again. The linked-
  account solved-count refresh still reads the full list.

### 9.2 CodeChef

#### Sources

- public catalog and contest endpoints where available;
- public profile HTML for aggregate profile statistics and embedded history;
- public `/recent/user` response for recent submission rows; and
- public contest problem JSON for problem tags and validated contest problem
  identities.

#### Recent activity and tags

The activity adapter parses recent rows, including problem code, contest code,
title, result, language, timestamp, and public solution ID when present. It
reads the whole public `/recent/user` feed (about a dozen rows per page, pages
`0..max_page`, newest first) in parts. CodeChef rate-limits after roughly ten
quick requests, so each run reads at most 8 pages:

1. Page 0, then newer pages until reaching the newest stored solution ID.
2. The backfill, oldest first: from `max_page` toward newer pages, until it
   meets the pages step 1 read.

The cursor records progress:

- `<highestSolutionId>` — the whole history is stored; later syncs only catch
  up.
- `v2:<highestSolutionId>:<maxPage>:<next>` — the backfill is unfinished and
  resumes at page `next`, counted when the feed's `max_page` was `maxPage`. New
  submissions push old pages down by about the change in `max_page`; the next
  run reads one page further back, so shifts cause re-reads, never gaps. Any
  other cursor value restarts the backfill.

An unfinished run returns `continueAfterMs` (2 minutes, or 5 after a failed or
rate-limited page), and the worker queues a `backfill_continuation` job (see
section 11) instead of waiting for the next hourly sync.

Tags come from a separate lookup of `/api/contests/PRACTICE/problems/<code>`
for stored solves that have none (see tag enrichment in section 11). Both
`computed_tags` and `user_tags` are read, but values containing digits or
underscores (contest codes such as `start255`, setter handles such as
`name_adm`) and difficulty labels such as `cakewalk` are dropped. Unknown tags
stay unknown rather than becoming topics. A failed lookup preserves the
accepted observation without inventing a tag. A challenge page, login wall, or
persistent block opens the capability circuit breaker and preserves the last
valid cache.

The public recent feed can omit newer contest submissions even when the public
profile already lists those contest solves. On a normal sync, the activity
adapter also checks up to two recent rated contests listed on the profile. It
matches profile-listed solved titles to the contest's public problem JSON and
stores only uniquely matched, validated problem codes. These are partial solved
observations, not invented submission or verdict rows. The exact solve time is
not available in this source, so the contest end is used as the observed time;
an eventual exact recent-feed submission supersedes that estimate. If the
profile and contest metadata cannot be matched, the adapter does not infer a
solve. This additional path helps activity and streaks reflect newly listed
CodeChef contest solves while retaining the recent feed's limitations.

### 9.3 LeetCode

#### Sources

- public GraphQL `matchedUser` profile query;
- public catalog/problem GraphQL queries;
- public `recentSubmissionList` for bounded recent submissions;
- public `question(titleSlug)` hydration for problem topic tags;
- public contest history and profile statistics; and
- sanitized public pages only where the configured capability allows it.

#### Profile-side skills

The profile query requests `tagProblemCounts` in the `advanced`,
`intermediate`, and `fundamental` groups. Every returned tag and its
`problemsSolved` count is retained in `ProviderProfile.topicCounts`. The three
groups are flattened into a native tag-count map for shared analytics; the
provider's tag names and counts remain unchanged.

#### Recent activity and tags

The activity adapter requests the public recent submission list, identifies
accepted rows, then batches public `question(titleSlug)` lookups. Each accepted
observation stores all returned `topicTags` names in `providerTags` and slugs in
`topics`. LeetCode returns at most the 20 newest public submissions regardless
of the requested limit, so every result is partial; it is not an all-time
solved list. Activity rows are keyed by title slug, which is always present,
so a failed detail lookup cannot create a second row for the same problem under
its numeric ID. GraphQL errors for one question (removed or restricted) no
longer discard the other questions in the batch, and solves still lacking tags
are retried by tag enrichment.

Authenticated operations such as `userProgressQuestionList`, session-cookie
handling, CSRF handling, private data, and premium content are not implemented.

### 9.4 CSES

The CSES catalog is public. A learner's CSES progress is visible only when
signed in, so CSES accounts link through the browser connector (section 9.5);
routes that make the server read a provider profile reject CSES.

- Source: public `https://cses.fi/problemset/` HTML.
- Parser: task sections and `/problemset/task/<id>` links.
- Output: task ID, title, canonical URL, section-derived tags/topics,
  completeness, freshness, and provenance.
- Cache: the normal catalog cache and provider request gate.
- Through the connector: solved status per task, submissions per task
  (time and accepted or not), and the account's solved total.
- Unsupported: ratings, contests, and per-submission language or runtime
  (these need one request per submission).

### 9.5 Browser connector (LeetCode and CSES)

LeetCode shows only the 20 newest submissions publicly, and CSES shows
progress only to its signed-in owner. The browser connector
(`apps/browser-extension`, Manifest V3) reads the learner's own history in the
learner's own signed-in browser and uploads normalized records. One source
builds for Chrome-family browsers (service worker) and Firefox-family browsers
such as Zen (event page, Gecko ID `connector@algomemtor.app`, Firefox 128+);
`npm run build:extension` writes both, zips them, and copies the zips to
`apps/web/public/extension/` for download. Deployment and store publishing are
in `apps/browser-extension/README.md`.

Pairing and authentication:

- Installing the extension opens Settings → Linked platforms
  (`/settings#platforms`) on the AlgoMemtor site. Its Browser connector card
  detects the extension through a content script that
  runs only on the site's origin (messages must come from the same window and
  origin), creates a connector token labelled `<browser> extension`
  (revoking an older one with the same label), and hands the secret to the
  extension, which verifies it with `/api/connector/session` and starts the
  first sync. No token is copied by hand. The card lists connected browsers,
  each of which can be disconnected (its token revoked).
- A token is `amc_` + 43 base64url characters, at most five active. The
  server stores only its SHA-256 hash (`core.connector_tokens`) and records
  last use. Revoking it stops uploads.
- The extension sends it as `Authorization: Bearer amc_…` to
  `GET /api/connector/session` and `POST /api/connector/ingest`. These two
  routes skip Supabase authentication and accept only connector tokens; a
  connector token cannot call any other route. Pending learner-data deletion
  blocks uploads.

What the extension reads (GET requests only, with the browser's own session):

| Provider | Request | Used for |
| -------- | ------- | -------- |
| LeetCode | `/api/problems/all/` | Signed-in username and every problem marked solved |
| LeetCode | `/api/submissions/?offset&limit=20&lastkey` | Full submission history: verdict, language, time, runtime, memory, passed tests |
| CSES | `/problemset/` | Signed-in user ID, each task's status and section |
| CSES | `/problemset/task/<id>/` | The learner's submissions for that task (time, accepted or not) |

Provider requests run inside a tab on the provider's site
(`scripting.executeScript` in the page's main world), reusing an open tab or
opening a background tab that is closed after the run. There they are
same-site requests, so the browser attaches the session cookie that it
withholds from a background request; LeetCode's signed-in GraphQL POSTs also
carry its CSRF token from the page. LeetCode always reads this way; CSES tries
a direct request first. If `/api/problems/all/` does not name the user, the
username comes from GraphQL `userStatus`, and if the REST submission list is
unavailable, pages come from GraphQL `questionSubmissionList`. Errors name the
failing request and HTTP status in the popup.

The extension drops everything else it receives, including source code, and
never reads cookies itself. CSES times are read as Helsinki local time.

Codeforces and CodeChef data is public and synced by the server, so for them
the extension only reads the signed-in handle (Codeforces: the header profile
link beside the logout link; CodeChef: `Drupal.settings.username`) and calls
`POST /api/connector/claim`. That links the handle if it is not linked (and
queues the initial sync), marks it verified, and otherwise requests a manual
server sync subject to the usual 15-minute cooldown. These accounts are not
marked as synced by the connector.

Requests first go directly from the extension with the browser's cookies; if
that reads as signed out, they run from a dedicated background tab the
extension opens on an ordinary page of the provider (LeetCode and CSES
problemset pages, which change views without reloading; the Codeforces and
CodeChef home pages), retry once on a fresh tab, and close it afterwards.
Browsers do not run extension scripts in plain-text documents, so the tab is
never a text file. The
extension's own tabs are the only ones it touches. Each platform's outcome,
with the real error text when one fails, is shown in the popup and sent to
`POST /api/connector/report`, which logs it as `connector_sync_reported`.

Verification through the connector rests on the learner's own extension
reporting the signed-in handle; a modified client could claim a handle it
does not control, but the first learner to link a handle keeps it and the
profile-code check (section 14) remains the stronger proof.

The website's **Sync platforms** button (Settings → Linked platforms and the
Dashboard header) asks the extension, through the pairing content script, to
run the same sync as the popup's Sync now, and shows the result when it
finishes. Manual syncs from either place are limited to one per 15 minutes
(the extension stores the time; the website reads it to show when the next
sync is available). Without a connected extension, the button requests the
server's manual sync for the linked public platforms, which has the same
15-minute cooldown.

The extension waits until a tab it opened has loaded a page on the
provider's own origin before scripting it; a new tab briefly reports a loaded
`about:blank`, which the extension has no permission to script.

The extension syncs when paired, whenever it starts (turned on, browser
start) unless it ran in the last 10 minutes, and on its interval. After each
run it shows a browser notification summarizing each platform (can be turned
off in the popup).

Fetching in parts: each run reads at most 25 LeetCode pages or 20 CSES tasks,
1.5 seconds apart. LeetCode first catches up from the newest submission until
it reaches the newest uploaded one, then continues the full-history backfill
from the saved offset; new submissions shift offsets, which only re-reads rows.
CSES reads tasks in ID order, earliest first, and re-reads a task only when its
status changes. Resume points move only after the server accepts the upload,
so a failed upload or rate limit causes re-reads, never gaps. Unfinished
history schedules the next run in 2 minutes (5 after a rate limit); otherwise
the extension runs on the learner's interval (hourly by default).

Server handling (`ConnectorService`):

- `ConnectorIngestRequestSchema` is strict: an unknown field such as `code` is
  rejected, identifiers must be LeetCode slugs or CSES task IDs, and the server
  builds every canonical URL itself.
- The signed-in handle must match the linked handle; if none is linked, the
  upload links it. Either way the account is marked `verified`, because the
  upload came from the owner's signed-in session.
- Rows are stored with `extraction_strategy = 'authenticated_connector'`, so
  connector evidence stays distinguishable from public and manual evidence.
  Submission event IDs are `lc:<id>` or `cses:<id>`.
- LeetCode public-feed rows (`recent:` event IDs, no real submission ID) that
  match a connector row by problem and time are deleted, and later public
  syncs skip them.
- CSES solved tasks take tags from the cached catalog or, failing that, from
  their problemset section (`cses`, section slug). CSES solved totals are set
  from the connector (`stats_source = 'browser_connector'`).

#### Decision: browser connector for signed-in history (2026-09-23)

- **Context:** the learner asked for complete history, including data only the
  signed-in owner can see. LeetCode and CSES offer no OAuth or API keys.
- **Chosen:** a learner-installed extension that reads the learner's own data
  in their browser and uploads normalized records with a revocable token.
- **Alternatives rejected:** storing session cookies on the server (full
  account access at rest, expiring sessions, likely terms violations, easily
  blocked); server-side password login (worse on every count, plus CAPTCHA and
  single sign-on).
- **Consequences:** syncs run only while the browser runs; provider page or
  API changes can break parsing (the extension reports errors per provider);
  AlgoMemtor never holds provider credentials; connector tokens are new
  secrets that must stay revocable and hashed.
- **Review triggers:** a provider offering an official API or OAuth, a
  provider objecting to this access, or any need to store data beyond
  normalized submission metadata.

#### Decision: LeetCode access despite robots.txt (2026-09-23)

- **Context:** LeetCode's robots.txt disallows `/api/`, `/graphql`, and
  `/submissions` for every user agent. The server's LeetCode sync (catalog,
  public profile, recent submissions) and the browser connector's LeetCode
  reads use those paths, and LeetCode's terms restrict automated access.
- **Chosen by the project owner:** keep hourly server syncs and hourly
  connector syncs as they are.
- **Alternatives considered:** reading LeetCode only when the learner clicks
  Sync (no scheduled or server polling), or removing LeetCode sync entirely.
- **Consequences:** the most complete LeetCode data, with the risk that
  LeetCode blocks the access or objects to it; the risk grows with the number
  of deployed users.
- **Review triggers:** before a public deployment, on any LeetCode objection
  or block, or when LeetCode offers an official API.

#### Decision: coach reads shared links and answers beyond CP (2026-09-24)

- **Context:** the project owner asked for a coach with the freedom of a
  general assistant: answer any question, work from links the learner pastes,
  and use all of the learner's platform and AlgoMemtor data. Pasted links were
  replaced with `[link omitted]`, and the coach refused non-CP topics.
- **Chosen by the project owner:** pasted public https links stay in the saved
  message. Platform problem links (Codeforces, CodeChef, LeetCode, CSES) are
  opened through the provider adapters' existing `getContent` path; any other
  link (or a platform page the adapter cannot open) is read by the AI
  service's `web_reader` for that turn only. The agent can also call
  `open_problem` (via `POST /internal/coach/problem-content`) and
  `read_web_page`. Statements and page text are transient context and are
  never stored. The CP-only scope rule is removed; safety rules remain.
- **Safety:** the reader accepts https only (http is upgraded), rejects
  credentials, private/loopback/link-local hosts and hosts that resolve to
  non-public addresses, re-validates every redirect, and bounds time (10 s),
  size (1.5 MB) and content type (HTML, text, JSON). Every safe public https
  link in an answer stays clickable (opened in a new tab with
  `noopener noreferrer`); other schemes, credentials, and private or internal
  hosts are reduced to their site name. A model-written URL can therefore be
  wrong; the prompt asks for links only when the coach is confident they
  exist.
- **Consequences:** a learner can ask the coach to read a problem page that a
  provider's terms may restrict for automated access; some sites block
  automated reads (the coach says so and helps from what it knows); DNS
  rebinding between validation and connect is not fully excluded.
- **Review triggers:** a provider objection, before a public deployment, or any
  need to store fetched page content.

### Provider source failure policy

| Condition                           | Result                                                    |
| ----------------------------------- | --------------------------------------------------------- |
| Timeout/network error               | Retry eligible failures with bounded exponential jitter   |
| `429`                               | Honor `Retry-After`; defer instead of immediate retry     |
| `403`, CAPTCHA, login wall, paywall | Disable affected capability; retain stale data            |
| `404`/unknown handle                | Stable not-found response; do not fabricate zeros         |
| Malformed schema                    | Partial valid records or capability-level circuit breaker |
| Redirect to unapproved host         | Reject response                                           |
| Oversized response                  | Reject response                                           |

---

## 10. Profile, solved activity, and tags

### Aggregate profile totals

The combined solved total is the arithmetic sum of the latest totals from active
linked providers. It intentionally does not deduplicate equivalent problems
across platforms. A stale or partial total is visibly qualified.

### Concrete observations

Concrete solved observations are keyed by `(providerAccount, externalId)` and
carry optional provider event IDs, timestamps, tags, normalized topics,
completeness, and provenance. Repeated syncs update observation timestamps
idempotently.

When a provider activity endpoint returns a different identifier form than the
catalog (for example, a LeetCode title slug instead of its numeric question
ID), coach assessment joins the observation to the trusted catalog by its
normalized canonical URL. This preserves concrete activity evidence without
claiming that aggregate totals identify particular solved problems.

### What “all tags” means

- For LeetCode profile analytics, all tags returned by the profile's three skill
  groups are captured with aggregate solved counts.
- For a fetched LeetCode recent accepted problem, all `topicTags` returned by
  its public question record are captured.
- For a fetched Codeforces accepted submission, public `problem.tags` are
  captured when returned by `user.status`.
- For a stored CodeChef accepted problem, both public tag arrays are captured
  when the problem endpoint returns them, minus contest codes, setter handles,
  and difficulty labels.
- No provider currently exposes a complete public lifetime mapping from every
  solved question to its tags without an approved authenticated connector or
  import.

This distinction prevents a profile aggregate such as `Array ×151` from being
mistaken for a list of 151 individually identified problems.

---

## 11. Synchronization and caching

### Provider sync worker

The dedicated provider worker consumes PostgreSQL-backed jobs using row leases.
It performs incremental, idempotent profile/activity/statistics upserts and can
resume after a restart.

Default policy:

- linking a public provider account enqueues an `initial_sync` job due now;
  this does not consume the manual-refresh cooldown, and the worker polls for
  due jobs every second;
- linked-user synchronization every hour with up to five minutes of jitter;
- manual refresh queued asynchronously with a 15-minute cooldown based only
  on earlier manual requests, not scheduled jobs;
- global catalogs refreshed every six hours;
- upcoming contests refreshed every 15 minutes;
- detailed problem content refreshed lazily with a 30-day TTL;
- a job lease of 10 minutes, so a first sync that pages through a whole public
  history is not reclaimed mid-run;
- a history backfill cut short by a rate limit or per-run budget continues in a
  `backfill_continuation` job after the fetcher's `continueAfterMs`. That job
  skips the stats and profile requests and passes `backfillOnly` so the
  fetcher spends its requests on history. A continuation that made no
  progress queues no further continuation; the hourly sync takes over;
- after each successful job the learner activity digest is recomputed
  (section 15);
- up to 40 stored solves without tags are looked up per sync (tag enrichment);
  a problem the provider publishes without tags is rechecked after 7 days;
- one active request stream per unofficial source;
- at least one second between CodeChef/LeetCode/CSES requests;
- Codeforces gate preserved at 2.1 seconds;
- two retries for eligible network/timeout/`5xx` failures;
- no immediate retry for `403`, `404`, validation failure, CAPTCHA, or login wall;
- stale cache retained when a new refresh fails.

### Sync lifecycle

```text
queued -> leased -> running -> succeeded
                         \-> retry_wait -> queued
                         \-> failed / stale
```

Each job has an idempotency key, attempts, run-after timestamp, optional cursor,
lease owner, lease expiration, and last error code. Source health is tracked at
capability level so a CodeChef activity failure does not disable its catalog.

The activity cursor is stored on the account's sync state and carried through
every state write. An adapter returns a new cursor only in a form that cannot
skip unstored submissions; when a fetch fails, the previous cursor is kept, so
the next fetch still stops at the same stored submission. A stored solve is
merged, not replaced: the earliest accepted time and its submission ID are
kept, and tags from an earlier lookup survive a later fetch that has none.

### Manual sync flow

1. Frontend posts a provider sync request.
2. Express validates that the provider is linkable and the account is linked.
   An explicit manual request can restore a missing public-stats consent
   timestamp without recording fabricated provider statistics or a refresh
   attempt. The background worker never grants consent on its own.
3. Express returns `202 Accepted` with a job/status reference.
4. The worker runs the job asynchronously.
5. The frontend polls sync status and refreshes profile/activity queries after
   success or visible failure.

---

## 12. HTTP API

All `/api/*` routes below require a valid Supabase bearer token unless noted.
The browser uses the central authenticated fetch client.

### Identity and learner profile

| Method | Path                   | Purpose                                         |
| ------ | ---------------------- | ----------------------------------------------- |
| `GET`  | `/health`              | Express health check; not learner-authenticated |
| `GET`  | `/api/me`              | Authenticated identity                          |
| `GET`  | `/api/learner-profile` | Load learner profile                            |
| `PUT`  | `/api/learner-profile` | Create/update onboarding profile                |
| `GET`  | `/api/providers`       | Enabled provider capabilities                   |
| `GET`  | `/api/topics`          | Normalized topic vocabulary                     |

### Provider accounts and sync

| Method   | Path                                                    | Purpose                                   |
| -------- | ------------------------------------------------------- | ----------------------------------------- |
| `GET`    | `/api/provider-accounts`                                | Linked accounts and statistics            |
| `PUT`    | `/api/provider-accounts/:provider`                      | Link/update public handle and consent     |
| `DELETE` | `/api/provider-accounts/:provider`                      | Disconnect while retaining history policy |
| `POST`   | `/api/provider-accounts/:provider/sync`                 | Queue asynchronous account sync           |
| `GET`    | `/api/provider-accounts/:provider/sync-status`          | Read job and capability status            |
| `DELETE` | `/api/provider-accounts/:provider/history`              | Permanently remove provider history       |
| `POST`   | `/api/provider-accounts/:provider/profile/refresh`      | Refresh profile snapshot                  |
| `POST`   | `/api/provider-accounts/:provider/public-stats/refresh` | Refresh aggregate public totals           |
| `PUT`    | `/api/provider-accounts/:provider/activity-consent`     | Enable/revoke activity consent            |
| `POST`   | `/api/provider-accounts/:provider/activity-sync`        | Queue activity synchronization            |
| `POST`   | `/api/provider-accounts/:provider/verification`         | Issue a 30-minute ownership code          |
| `POST`   | `/api/provider-accounts/:provider/verification/check`   | Verify the code on the public profile     |
| `GET`    | `/api/me/activity-digest`                               | Stored synced-activity summary            |
| `GET`    | `/api/connector/tokens`                                 | List active browser-connector tokens      |
| `POST`   | `/api/connector/tokens`                                 | Create a token (secret returned once)     |
| `DELETE` | `/api/connector/tokens/:id`                             | Revoke a token                            |
| `GET`    | `/api/connector/session`                                | Connector token: pairing check            |
| `POST`   | `/api/connector/ingest`                                 | Connector token: upload normalized history |

CSES links only through the browser connector; routes that make the server
read a provider profile (link, sync, refresh, activity, verification) reject
it with `400`.

### Catalog and activity

| Method   | Path                                           | Purpose                                       |
| -------- | ---------------------------------------------- | --------------------------------------------- |
| `GET`    | `/api/problems`                                | Unified filtered catalog and pagination       |
| `GET`    | `/api/problems/:provider/:externalId`          | Validated detail and provenance               |
| `GET`    | `/api/problems/:provider/:externalId/progress` | Learner progress                              |
| `PUT`    | `/api/problems/:provider/:externalId/status`   | Set manual learner status                     |
| `DELETE` | `/api/problems/:provider/:externalId/progress` | Remove progress                               |
| `GET`    | `/api/activity`                                | Merged submissions, solves, ratings, contests |
| `GET`    | `/api/contests`                                | Upcoming and historical contests              |
| `GET`    | `/api/analytics`                               | Unified or provider-filtered analytics        |

### Recommendations and learner actions

| Method   | Path                                                   | Purpose                      |
| -------- | ------------------------------------------------------ | ---------------------------- |
| `GET`    | `/api/recommendations`                                 | Current recommendation feed  |
| `POST`   | `/api/recommendations/refresh`                         | Queue/build a refreshed feed |
| `PATCH`  | `/api/recommendation-items/:itemId/feedback`           | Save recommendation feedback |
| `POST`   | `/api/recommendation-items/:itemId/dismiss`            | Dismiss a recommendation     |
| `POST`   | `/api/recommendation-dismissals/:provider/:externalId` | Dismiss a trusted problem directly (not recommendation-feed scoped) |
| `GET`    | `/api/recommendation-dismissals`                       | List dismissed items         |
| `DELETE` | `/api/recommendation-dismissals/:provider/:externalId` | Restore dismissed item (any supported provider) |
| `POST`   | `/api/recommendation-items/:itemId/impression`         | Record impression            |
| `GET`    | `/api/bookmarks`                                       | List bookmarks               |
| `POST`   | `/api/bookmarks`                                       | Create bookmark              |
| `DELETE` | `/api/bookmarks/:provider/:externalId`                 | Delete bookmark              |
| `POST`   | `/api/problems/:provider/:externalId/reflections`      | Save reflection              |
| `POST`   | `/api/problems/:provider/:externalId/timer`            | Start timer                  |
| `POST`   | `/api/timers/:sessionId/pause`                         | Pause timer                  |
| `POST`   | `/api/timers/:sessionId/resume`                        | Resume timer                 |
| `POST`   | `/api/timers/:sessionId/resolve`                       | Resolve timer                |

### Personalized coach and roadmap

| Method   | Path                                                | Purpose                                                           |
| -------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `GET`    | `/api/coach/conversations`                          | List saved owner-scoped coach threads                             |
| `POST`   | `/api/coach/conversations`                          | Create a named coach thread                                       |
| `GET`    | `/api/coach/conversations/:conversationId`          | Read sanitized history                                            |
| `PATCH`  | `/api/coach/conversations/:conversationId`          | Rename a thread                                                   |
| `DELETE` | `/api/coach/conversations/:conversationId`          | Delete messages, proposals, summaries, and audit references       |
| `POST`   | `/api/coach/conversations/:conversationId/messages` | Submit a bounded coaching question and optional transient context |
| `GET`    | `/api/coach/roadmap`                                | Read the persistent deterministic improvement roadmap, with a computed `refreshHint` |
| `POST`   | `/api/coach/roadmap/refresh`                        | Pull the newest data from every linked platform (bounded live refresh), rebuild the plan, record `lastRefreshedAt`, and invalidate the next recommendation batch |
| `PATCH`  | `/api/coach/roadmap/topics/:topic/status`           | Set or clear a manual topic status                                |
| `POST`   | `/api/coach/roadmap/notes`                          | Submit a free-text learning-plan note; AI picks the topic and status it refers to and queues it as memory evidence |
| `GET`    | `/api/coach/preferences`                            | Read weekly/event check-in preferences                            |
| `PUT`    | `/api/coach/preferences`                            | Save weekly local day/time and event preference                   |
| `GET`    | `/api/coach/check-ins`                              | List generated in-app check-ins and unread count                  |
| `PATCH`  | `/api/coach/check-ins/:checkInId`                   | Mark a check-in read/unread or dismiss/restore it                 |
| `POST`   | `/api/coach/action-proposals/:proposalId/confirm`   | Revalidate and apply an explicit learner confirmation             |

The memory worker periodically enumerates enabled learner schedules and queues
one owner-scoped refresh per local day (with a separate weekly-due phase). It
calls the internal `POST /internal/coach/check-ins/refresh` endpoint with the
shared service token for durable scheduled refreshes. The endpoint is not
exposed to the browser.

### Mentor tools

| Method | Path                                            | Purpose |
| ------ | ----------------------------------------------- | ------- |
| `GET`  | `/api/problem-help/sessions`                    | List the learner's Doubt Helper sessions |
| `POST` | `/api/problem-help/sessions`                    | Start a session and return the first hint or diagnosis |
| `GET`  | `/api/problem-help/sessions/:sessionId`         | Read a session and its turns |
| `POST` | `/api/problem-help/sessions/:sessionId/turns`          | `next_hint`, `submit_attempt`, `ask`, `request_solution`, `cancel_solution`, `confirm_solution`, `complete`, `abandon` with `expectedVersion` |
| `GET`  | `/api/solutions`                                | Recent solution explorations |
| `GET`  | `/api/solutions/access?problemUrl=&language=`   | Learner status and unlock reason for a problem |
| `POST` | `/api/solutions/explore`                        | Generate or reuse an exploration (optional `transientStatement`) |
| `POST` | `/api/solutions/chat`                           | Answer a follow-up question with the cached exploration as context |
| `GET`  | `/api/upsolve`                                  | Queue, contests, 30-day summary and history (`?refresh=true` pulls platform data first) |
| `PUT`  | `/api/upsolve/items/:provider/:externalId`      | Skip, restore or mark solved (`skipped`, `pending`, `solved`) |
| `GET`  | `/api/contest-analysis`                         | Contest list and cross-contest pattern metrics |
| `GET`  | `/api/contest-analysis/:provider/:contestId`    | Contest metrics and cached narrative |
| `POST` | `/api/contest-analysis/:provider/:contestId/narrative` | Write or reuse the contest narrative |
| `POST` | `/api/contest-analysis/patterns/report`         | Write or reuse the cross-contest report |
| `GET`  | `/api/progress-report`                          | Deterministic progress report and this week's narrative |
| `POST` | `/api/progress-report/narrative`                | Write or reuse the weekly insight report |

Stable errors: `PROBLEM_HELP_SESSION_NOT_FOUND` (404),
`PROBLEM_HELP_INVALID_STATE`, `PROBLEM_HELP_STALE_VERSION`,
`PROBLEM_HELP_SOLUTION_LOCKED`, `SOLUTION_LOCKED` (409),
`PROBLEM_CONTEXT_UNAVAILABLE`, `PROBLEM_UNRESOLVED`,
`NOT_ENOUGH_CONTEST_DATA` (422), `CONTEST_NOT_FOUND`, `REVISION_NOT_FOUND`
(404), `MENTOR_AI_RATE_LIMITED` (429) and `MENTOR_AI_UNAVAILABLE` (503).
Internal FastAPI endpoints: `POST /internal/mentor/problem-help`,
`/internal/mentor/solutions`, `/internal/mentor/solution-chat`,
`/internal/mentor/upsolve-pick`,
`/internal/mentor/contest-analysis`,
`/internal/mentor/contest-patterns` and `/internal/mentor/progress-narrative`.

### Progress, memory, consent, and deletion

| Method   | Path                                     | Purpose                       |
| -------- | ---------------------------------------- | ----------------------------- |
| `GET`    | `/api/progress/history`                  | Manual progress history       |
| `GET`    | `/api/progress/analytics`                | Progress conversion analytics |
| `GET`    | `/api/learner-memories`                  | List learner memories         |
| `POST`   | `/api/learner-memories`                  | Add active learner guidance   |
| `PATCH`  | `/api/learner-memories/:memoryId`        | Edit/archive/restore memory   |
| `POST`   | `/api/learner-memories/:memoryId/action` | Apply memory action           |
| `GET`    | `/api/ai-consent`                        | Read the always-on AI policy  |
| `PUT`    | `/api/ai-consent`                        | Legacy compatibility endpoint |
| `GET`    | `/api/me/data/status`                    | Deletion/status information   |
| `DELETE` | `/api/me/data`                           | Cascade-delete learner data   |

Stable API errors include `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`,
`PROVIDER_UNAVAILABLE`, `PROVIDER_INVALID_RESPONSE`, `PROVIDER_BLOCKED`,
`PROVIDER_ACCOUNT_NOT_FOUND`, and authentication/validation errors.

---

## 13. Database model

Prisma owns the `core` schema. Important tables include:

### Learner and identity

- `core.users` — application user mapped to Supabase subject.
- `core.learner_profiles` — structured onboarding answers.
- `core.provider_accounts` — linked public handles, consent, stats, sync state,
  and disconnect metadata.

### Provider data

- `core.external_problem_cache` — normalized catalog metadata, tags, topics,
  availability, freshness, and provenance.
- `core.problem_content_cache` — permitted sanitized content only.
- `core.external_contests` — contest catalog and provenance.
- `core.provider_profile_snapshots` — profile totals, languages, aggregate
  topics, badges, calendar, and fetched timestamps.
- `core.provider_submissions` — normalized submission rows, with optional
  `runtime_ms`, `memory_kb`, and `passed_test_count` judge details.
- `core.provider_solved_observations` — concrete solved problems, including
  `provider_tags` and `normalized_topics` arrays, and `tags_checked_at` for
  the last tag lookup.
- `core.provider_rating_changes` — rating progression.
- `core.contest_participations` — contest evidence.
- `core.provider_verified_activity` — minimal Codeforces evidence rows where
  the existing provider flow supports them.

### Sync and product behavior

- `core.provider_sync_states` — capability-level cursor/freshness/error state.
- `core.provider_sync_jobs` — queued work, leases, retries, and idempotency.
- `core.connector_tokens` — browser-connector pairing tokens (SHA-256 hash,
  label, last use, revocation).
- `core.learner_activity_digests` and `core.learner_activity_changes` — the
  stored activity digest per learner and the change notes sent as memory
  evidence.
- `core.normalized_topics` — seeded shared topic vocabulary.
- `core.bookmarks` — learner-owned saved problems.
- `core.problem_actions` — impressions, dismissals, feedback, status; legacy
  open rows may remain but are not surfaced or written.
- recommendation batches/items/history tables.
- progress reflections and timer sessions.
- `core.coach_conversations`, `core.coach_messages`, and
  `core.coach_action_proposals` — sanitized saved threads and confirmation-gated
  actions.
- `core.coach_roadmaps` and `core.coach_roadmap_revisions` — one current
  roadmap per learner plus append-only versioned snapshots.
- `core.coach_topic_statuses` and `core.coach_topic_status_events` — manual
  status precedence and append-only status history.
- `core.coach_preferences` and `core.coach_check_ins` — local weekly/event
  settings and in-app nudges with event keys, fallback labels, and read/
  dismissed state.
- `core.problem_help_sessions` and `core.problem_help_turns` — Doubt Helper
  identity, doubt, short attempt summary, stage, hint level, bug category and
  the saved hint/answer text. Learner code, compiler output and pasted
  statements are never stored.
- `core.mentor_reports` — cached AI reports keyed by learner, kind and key
  (`solution_exploration`, `contest_analysis`, `contest_patterns`,
  `progress_narrative`) with a source hash for regeneration.
- `core.upsolve_item_states` — skipped upsolve items.
- `core.revision_items` — no longer read or written (the revision schedule was
  removed on 2026-09-25); the table is kept until a migration drops it.

All provider rows retain provider identity and provenance. Unique constraints
prevent duplicate provider/account/problem observations. Deletion cascades from
the learner and explicit provider-history deletion removes snapshots, activity,
analytics source rows, and provider-generated evidence.

### Migrations

The current working tree includes migrations for:

- solved-observation provider tag/topic arrays; and
- CSES provider identities and `cses.fi` canonical URLs in relevant tables.
- personalized coach conversations, roadmaps, status history, check-ins, and
  prerequisite metadata.
- `core.coach_messages.rich_content` — validated `coach-rich-v2` response
  snapshots for charts, metrics, timelines, comparison tables, source
  citations, and trusted problem lists.
- submission judge details (`runtime_ms`, `memory_kb`, `passed_test_count`) and
  `provider_solved_observations.tags_checked_at`.

Alembic owns the AI-only tables:

- `ai.coach_invocation_audits` — model/version, explicit knowledge/memory/web
  retrieval-lane flags, latency, token/cost metadata, and fallback state; the
  keyed context fingerprint supports correlation without storing raw prompts
  or private snapshots.
- `ai.coach_knowledge_sources` and `ai.coach_knowledge_chunks` — versioned
  original CP/DSA reference chunks, checksums, topic metadata, and optional
  pgvector embeddings used by hybrid retrieval.
- `ai.learner_memories` and related evidence/audit tables remain learner-owned
  and are deleted by the existing consent-revocation and learner-deletion
  workflows.

Apply core migrations only through Prisma after PostgreSQL is available.

---

## 14. Authentication and privacy

### Supabase JWT verification

Express and FastAPI verify, rather than merely decode, access tokens. Validation
includes:

- cryptographic signature through remote JWKS;
- issuer;
- audience `authenticated`;
- expiry;
- non-empty subject; and
- role `authenticated`.

Only ES256 and RS256 are accepted. Missing, malformed, expired, wrong-issuer,
wrong-audience, wrong-role, missing-subject, and invalid-signature tokens return
`401` with `WWW-Authenticate: Bearer`.

### Provider linking

Linking a provider records a public handle and explicit consent. One active
identity per learner/provider is used while disconnected identities and history
can remain archived.

Ownership verification is separate and optional. The learner requests a
one-time code (`AM-` plus eight unambiguous characters, valid for 30 minutes),
places it in a public profile field, and asks the server to check:

- Codeforces — first name, last name, or organization from `user.info`;
- CodeChef — anywhere on the public profile page (for example, the name);
- LeetCode — `profile.realName` or `profile.aboutMe` from public GraphQL.

The server reads only that public profile; no password, cookie, or token is
requested. On a match the account becomes `verified` with `verified_at`, and
the code is cleared; the learner can then remove it from their profile. The
code and expiry are part of the database update filter, so a replaced or
expired code cannot verify. Relinking the same handle keeps verification, and
a different handle starts unverified.

Disconnecting stops synchronization. History remains until explicit provider
history deletion or full learner deletion.

### Secret handling

- Supabase publishable key may be exposed to Vite.
- Supabase secret/service-role keys remain server-side.
- The OpenRouter key remains in production FastAPI configuration only.
- Internal service tokens are server-to-server only.
- Provider passwords, cookies, CSRF tokens, CAPTCHA results, private responses,
  and learner source code are never persisted or logged.
- Logs contain provider, status, retryability, safe counts, duration, and stable
  error codes—not handles, raw HTML, raw GraphQL, credentials, or payloads.

### External data safety

- Provider payloads are schema-validated.
- URLs are reconstructed from trusted provider IDs and allowlisted hosts.
- Redirect targets cannot be arbitrary browser-supplied URLs.
- HTML is sanitized before any permitted rendering.
- AI receives bounded metadata and derived features, not raw provider pages or
  credentials.

### Personalized coaching and memory policy

On 2026-09-24 the product decision changed personalized coaching and learner
memory from an optional Settings consent to an always-on product capability.
The `personalized-coaching-rag-v2` policy remains the disclosure and audit
version, but missing, legacy, and previously disabled records resolve to the
current enabled policy. A database migration appends that effective policy for
existing accounts, including accounts that previously opted out. The browser
no longer exposes a Coach and privacy toggle. While enabled, Express
sends FastAPI only a bounded snapshot: profile/goals, deterministic roadmap and
assessments, provider completeness, recent activity/contests/ratings,
recommendation feedback, bookmarks/dismissals, reflections, up to five
active query-relevant memories (with persistent instructions prioritized), and
a rolling sanitized conversation summary. A
conditional public-search lane receives only a de-identified CP/DSA query; it
never receives names, handles, ratings, conversations, profile details, or
private learner history.

Safe conversation text is retained until the learner deletes the thread. Code
blocks and copied problem context supplied as transient context are sent only
for the current request and saved as an omission marker; they are not logged,
embedded, or included in AI audits. Learners may also attach one supported image,
document, audio, or video file of up to 8 MiB to a coach turn through a single
attachment control. JPEG, PNG, WebP, PDF, TXT, Markdown, DOCX, MP3, WAV, M4A,
MP4, and WebM are accepted. TXT, Markdown, and DOCX text is extracted in memory;
other supported formats are sent as transient media when the selected production
model accepts them. Local Qwen development remains text-first; unsupported media
produces a clear request for extracted text or a screenshot,
audio/video through a transient Whisper transcription, and PDFs through bounded
local text extraction. The attachment is used for that
turn only and is never saved in conversation history, embeddings, or audits.
Attachment analysis follows the same always-on AI disclosure and is not used
for public-web search grounding. Audits retain model/version, latency,
token/cost metadata, conversation/learner ownership, and a keyed context
fingerprint, never raw prompts or context snapshots. Action proposals are
revalidated and applied only after an authenticated, idempotent `CONFIRM`.
The legacy AI-consent endpoint remains compatibility-only and cannot create a
disabled effective policy. Provider-account and provider-activity consent are
unchanged and still require explicit learner action. Learners retain review,
correction, archive, and delete controls for memories, plus the existing
cascade-delete flow for all learner data.

---

## 15. Recommendations, routed AI, and memory

### Coach RAG v2 retrieval and rich responses

Coach turns use three bounded retrieval lanes. Express deterministically builds
the learner snapshot (profile and goals, 30/90-day activity trends where
observed, provider profiles/submissions/solves/contests/ratings, roadmap
transitions, feedback, bookmarks, reflections, and trusted catalog candidates).
Express retrieves up to five semantically relevant active learner memories
(while preserving the learner's explicit profile instructions and preferences) and FastAPI retrieves
up to eight chunks from the versioned `coach_knowledge_sources`/
`coach_knowledge_chunks` index. The knowledge lane combines keyword overlap
with pgvector similarity when embeddings are available and caps repeated topics
for diversity. Retrieved fields are untrusted reference material and cannot
override the coach safety instructions.
For a short conversational follow-up, the private knowledge lookup includes a
bounded, sanitized excerpt of the previous user and coach turns so questions
such as “why does that work?” retain their algorithm topic. An independent new
question searches on its own. This conversation excerpt is never added to the
public-web search query or stored in retrieval audits.

The relevance router invokes at most one OpenRouter hosted web-search call
when the question requests current/public/external information or internal
coverage is insufficient. The query is de-identified before the call, and
grounding metadata is converted into at most five validated public HTTPS
citations. Practice-problem requests also activate this lane. The query may add
up to three generic current-focus topic names, but never a name, handle, rating,
conversation, or private history. AI may select exact grounded citation IDs
as web problem sources. Express accepts only selected IDs that are present in
Google's grounding metadata and still pass public-HTTPS validation;
model-authored URLs are never accepted. Web results cannot fabricate learner
metrics or make roadmap changes.

The public `/api/coach/.../messages` endpoint remains non-streaming. An internal
`/internal/coach/respond/stream` SSE transport is available for clients that need
a cancelable pending state; it emits only after the same complete response
validation, so partial model output never reaches the browser. Express validates
and persists a `coach-rich-v2` snapshot alongside each assistant
message. Visual blocks (metric grids, line/bar/stacked-bar charts with an
accessible table fallback, timelines, and comparison tables) are generated only
when the learner explicitly asks for a visual display. Problem cards can still
appear when the learner requests practice or problem recommendations. A
response can also contain up to five trusted catalog problems or grounded web
problem sources, plus
citations and two to four follow-up questions. AI chooses from the
allowlisted dataset IDs, catalog problem IDs, and grounded citation IDs
available for that turn; chart numbers and catalog problem links are hydrated
from deterministic Express datasets. Web problem cards link through verified
grounding metadata and are visibly attributed as web-grounded. Existing v1
messages without `richContent` remain readable.

If generation, embeddings, the knowledge database, or web search is
unavailable, the deterministic composer still returns requested trusted learner
metrics, history, charts, and problems where available, while chat uses a
concise retry message instead of topic-specific hard-coded advice. Internal fallback and data
quality fields remain available to audits and contracts but are not exposed as
technical labels in the learner UI. Raw web
pages, search text/queries, prompts, transient code, and private context are
not stored in messages or audits. Only model/version, retrieval-lane flags,
latency, token/cost metadata, and keyed context fingerprints are audited.

The AI service also applies a process-local rate guard to `/internal/*` calls
and returns `429` with `Retry-After` when a caller exceeds the bounded window.
It warms the knowledge index during application lifespan startup instead of
seeding on every turn. The seed is `coach-knowledge-v2`; the Alembic curriculum
migration adds hint ladders, prerequisite edges, per-topic mastery/SM-2 state,
and contest-performance records. The deterministic pedagogy helpers classify
frustration and momentum, select Socratic/guided/direct teaching behavior,
track Bloom progression and repeated mistake signals, build progressive hint
ladders, compute SM-2 intervals and mastery, and topologically order
prerequisite paths.

### Personalized CP/DSA coach

`CoachService` owns `topic-assessment-v1`. For each curated taxonomy topic it
uses smoothed unique-problem success (30%), breadth capped at eight solves
(25%), target-band difficulty progression (20%), recent submission accuracy
(15%), and recency (10%). Confidence is reduced for partial, unknown, or stale
provider observations. Fewer than three concrete problems or confidence below
0.35 yields `insufficient_evidence`; the other levels are
`needs_practice`, `developing`, `comfortable`, and `revisit` under the
documented score/evidence thresholds. Manual statuses (`working_on`,
`practiced`, `completed`, `revisit`, `skip_for_now`) determine the displayed
roadmap lane for visible topics and never get overwritten by reassessment.

Explicit topic exclusions written in the learner's recommendation note are
parsed deterministically and removed from coach focus, rich content, fallback
answers, and trusted practice candidates. The raw note is redacted before it
reaches the AI model.

The prerequisite graph and provider-tag aliases are deterministic and limited
to the canonical taxonomy. Optional practice sets are selected by Express from
trusted catalog records, exclude solved/actively dismissed identities, and are
capped at two foundation, two target, and one stretch problem per topic.
AI may order or explain those candidates but cannot invent IDs or URLs. In
coach chat only, AI may additionally select up to five exact web citation IDs
produced by the separate de-identified OpenRouter web-search call. These
appear as attributed external practice sources, not trusted catalog records;
they cannot be bookmarked, marked solved, or used as roadmap evidence until a
provider adapter validates and imports the corresponding identity.

After each saved coaching turn, the outbox queues a bounded conversation-memory
job. The worker sends only recent sanitized turns (with code, links, and copied
problem context omitted) to the memory service, which can propose at most two
durable learner facts such as an explicit instruction, goal, explanation
preference, mistake pattern, or conversation summary. Retrieval always includes
active instruction/preference memories and then adds query-relevant semantic and
keyword matches. Consolidation remains explicit, owner-scoped, and
confirmation-safe.

**Turn routing, grounding, and latency.** Both Express (`coach-intent.ts`) and
FastAPI (`coach_intent.py`) classify a turn before any heavy work. Short
conversational messages (greetings, thanks, goodbyes, "who are you") take a
small-talk path: Express sends only the stored plan's focus names and the last
four turns with `turnKind: "smalltalk"`; FastAPI answers with one short,
FAST-model call with no retrieval, web
research, tools, or learner statistics, and falls back to a fixed reply if the
model fails. Every other turn uses the full pipeline. The system prompt requires
answers to match the question's scope and every learner-specific number or
problem to be copied from supplied data or tool results; raw
`provider:externalId` tokens are stripped from answer prose (outside code)
because internal IDs differ from public numbers (LeetCode's internal 1007 is
public problem 967). Deep reasoning (`COACH_THINKING_LEVEL`) is reserved for
debugging, proofs, attached code, and plans; other agent turns use light
reasoning. Production routes ordinary conversations to FAST, difficult reasoning
to STRONG, and contexts above the configured threshold to HUGE CONTEXT. Local
development uses its single Qwen3-8B model. Express bounds semantic
memory retrieval to 3 s and falls back to the stored memory list. Public web
grounding no longer triggers on words such as "now" or "current" in personal
questions.

**Chat layout.** The main chat shows only the coach's prose; fenced code becomes
a compact chip, and LaTeX math is rendered as plain text (the AI service
converts it and the web renderer converts older messages). The right-hand
Answer details panel (a drawer below 1280 px) shows, for the selected answer,
picked problems, code, web problem links, charts and data (only when
requested), and confirmation-gated actions. Follow-up suggestions and source
lists are not shown anywhere. The coach context also carries today's
recommendation feed (`currentRecommendations`).

**Roadmap refresh.** `GET /api/coach/roadmap` rebuilds the plan from stored
evidence on every read and saves a new version only when its content changes.
`POST /api/coach/roadmap/refresh` first runs the bounded live refresh (25 s per
platform, at most once per learner and platform every 3 minutes; browser-connector
providers report their last upload) for every linked account, then rebuilds and
saves the plan with `lastRefreshedAt`, and invalidates the learner's cached
recommendation batch. Reads carry a computed, never-persisted `refreshHint`
that suggests a refresh when platform data is stale or the plan has neither
changed nor been refreshed for seven days; neither field affects the plan's
version. The Learning plan tab shows a Refresh plan action and the suggestion,
and the coach receives `roadmap.refreshSuggested` so it can recommend a refresh
when the learner asks about their plan.

Deterministic goal templates cover Codeforces Expert/1600, interview preparation,
and ICPC foundations. They order unmet skills through prerequisites, allocate
bounded weekly targets, carry due-review topics into the plan, and reuse the
mastery and SM-2 helpers used by proactive check-ins.

The non-streaming coach response is validated before it reaches React. It may
contain teaching, contest/attempt debriefs, evidence
references, and confirmation-gated roadmap/progress/bookmark proposals. A
progressive hint ladder is reserved for requests to solve a specific CP/DSA
problem; concept, planning, interview, debugging, and profile questions are
answered directly. Transient code/problem/media input is never persisted. If
FastAPI AI is down or returns a fallback response, the roadmap and practice
set remain usable, but chat saves and displays only “Coach is unavailable right
now. Please try again later.” No coaching advice, evidence, rich blocks, action
proposals, or learner-memory job is generated for that failed turn. The fallback
flag remains internal for observability and is not shown as a learner-facing
product label.

Coach check-ins were retired with the Pathway page (2026-09-25). The memory
worker no longer schedules `coach_check_in_refresh` jobs; rows queued earlier
are completed without work.

### Coach agent and complete learner workspace

Chat turns run as a bounded tool-using agent (`coach-workspace-v1`). Express
assembles an owner-scoped workspace for the turn: linked accounts (handle,
rank, current and peak rating, platform totals, languages), every observed or
manual solve enriched with catalog title, rating and tags, up to 2,500 recent
submissions, attempted-but-unsolved problems, all contests and rating changes,
roadmap topics, bookmarks, and a pool of up to 360 unsolved, non-dismissed,
non-excluded catalog problems near the learner's level. A compact
`profileDigest` (totals, rating bands, hardest solves, top and weak tags,
verdict mix, languages, streaks, contest summary) is always in the prompt; the
rest is never placed in the prompt wholesale. The model queries it through
read-only tools (`query_solved_problems`, `query_submissions`,
`query_unsolved_attempts`, `get_contest_history`, `get_rating_history`,
`get_topic_breakdown`, `get_activity_summary`, `find_practice_problems`,
`search_knowledge`, `web_search`, `recall_memory`) and finishes with
`submit_answer`. `recall_memory` runs the same hybrid (pgvector + keyword)
retrieval as the up-front memory lane, for up to eight active memories, when the
answer depends on earlier conversations or history that the preloaded memories
do not cover. The learner ID comes from the authenticated internal request, not
from the model, so the tool can read only that learner's memory; a storage
failure is returned as a tool error rather than failing the turn. The
workspace contains no URLs, source code, statements, or credentials; the agent's
web-search queries are de-identified and additionally stripped of the learner's
own handles.

Model output is repaired rather than rejected: links are reduced to their site
name, Markdown link targets are dropped, invalid evidence/proposal/presentation
items are removed individually, and over-long answers are shortened on a code
fence boundary. Coach-authored answers keep Markdown and fenced code examples;
learner-supplied code is still omitted line by line before storage. Problems
the model selects are hydrated only from roadmap suggestions or the trusted
practice pool, and proposals may target those problems or ones already in the
learner's history. Provider quota errors are surfaced as `429` by FastAPI and
shown as a usage-limit message instead of triggering another model call.
Check-ins and other background generations stay on a single model call. For
clearly personal questions (contests, rating, verdicts, solves, activity,
topics, practice picks) the evident workspace queries run deterministically
before the first model step and arrive as `prefetchedToolResults`, which keeps
lighter models grounded and usually saves a tool round. Each agent turn uses
one to `COACH_AGENT_MAX_STEPS + 1` model requests (default at most five).
`COACH_MODEL_REQUESTS_PER_MINUTE` can be set to the project's RPM quota so turns
wait briefly for a slot instead of receiving provider 429s. Development uses
`qwen3:8b-q4_K_M`. Production uses `openai/gpt-oss-20b` for ordinary turns,
`openai/gpt-oss-120b` for deep reasoning, and `qwen/qwen3.8-flash` only when
packed context exceeds `AI_HUGE_CONTEXT_THRESHOLD_TOKENS`. Configurable price
fields keep request audit estimates current; they are advisory rather than
provider billing records.

### Coach token budgets and context packing

Each coach turn gets a budget from `coach_context.py` before any model call:

| Tier | Chosen when | Output ceiling | Local / production context budget | Agent steps |
| ---- | ----------- | -------------- | --------------------------------- | ----------- |
| quick | short factual questions ("what is my rating?") | 1,024 (local 600) | 1.8k / 5k tokens | 1 |
| standard | everything else | `COACH_MAX_OUTPUT_TOKENS` (local 1,200) | 3.2k / 12k tokens | 2 |
| deep | code, debugging, proofs, plans, links, attachments | `SOLUTION_MAX_OUTPUT_TOKENS` (local 2,000) | 5.5k / 90k tokens | `COACH_AGENT_MAX_STEPS` |

Only deep turns use the configured high reasoning level. Local context is kept
inside the 16K Ollama window. The newest conversation turns get a fifth of the
input budget; a turn too long to fit (a long answer before a follow-up) is
shortened rather than dropped with everything older.

#### Local model tuning (2026-09-25)

Measured on a 16 GB laptop, `qwen3:8b-q4_K_M` reads about 220 and writes about
15 tokens a second, and its default "thinking" made answers roughly ten times
slower. Local mode therefore:

- answers with thinking off (`LOCAL_AI_THINKING=off`; `deep` lets only the
  deepest requests think), except short general-knowledge questions ("Who won
  the 2022 World Cup?"), which reason first because the model misremembers
  plain facts without it (about 250 extra tokens) and are answered without
  commentary on the learner's data;
- answers Coach turns in one call over prefetched workspace data
  (`LOCAL_AI_SINGLE_CALL=true`) instead of a multi-step tool agent;
- keeps the chat model loaded (`LOCAL_AI_KEEP_ALIVE_MINUTES`, refreshed through
  Ollama's native `/api/generate`, since its OpenAI endpoint ignores
  `keep_alive`) and loads the embedding model once per process, in the
  background at startup (the first load takes about 12 s; a warm query embeds
  in 0.03 s);
- raises unset timeouts to 300 s (requests), 280 s (Coach) and 480 s (mentor
  tools);
- asks mentor tools for schema-constrained JSON (`json_schema`) instead of
  function calling. With tool calls the small model escapes long programs in
  the arguments itself, and one bad escape made Ollama drop the whole reply
  (Solution Explorer failed after minutes); constrained JSON always parses and
  needs fewer input tokens. Failures log only their shape
  (`mentor_structured_invalid`: finish reason, tool-call count, failing
  fields).

Measured locally after these changes: Coach data answers 25–40 s, small talk
2 s, a world-fact answer 25 s; Doubt Helper turns about 40 s; a contest
pattern report 93 s; a progress narrative 54 s; a recommendation ranking of 40
candidates 25–37 s; a full Solution Explorer exploration about 150 s and a
follow-up 19 s.

Grounding checks run after a local answer: practice recommendations for a weak
area are prefetched for the weakest tag (ranked by failed submissions per
solve, platform-name tags excluded); an answer that lists recommended problems
missing from the learner's workspace is rewritten once against the trusted
list; and pool problems listed without IDs still get their problem card. Production keeps ordinary packed context bounded
and selects the huge-context role only above the configured 100K threshold.
Tool results are capped per tier (6k, 14k and 30k characters).

The context is packed to the turn's input budget: governing fields
(instructions, excluded topics, preferences, linked problems, coaching
guidance) always stay; the newest conversation turns are kept for follow-ups;
knowledge chunks and memories keep their vector-retrieval order (pgvector
hybrid search) and are re-ranked against the question; roadmap topics,
recommendations and activity sections are included first when the question is
about them and ranked by relevance within the section. Whatever does not fit is
listed in `contextNotes.omitted` so the agent can fetch it with its workspace
tools.

### FastAPI ranking contract

Express sends a bounded candidate set and structured learner context to the
internal ranking endpoint. FastAPI verifies the internal service token, invokes
the routed model through LangChain, and returns structured candidate
IDs, scores, reasons, fallback state, measured latency, and optional token/cost
metadata.
The `ai-provider-router-v3` request also includes up to 25 per-topic counts of
unique observed attempted and solved problems derived from owner-scoped manual
statuses and permitted provider observations. These are lower bounds, not a
mastery score or complete cross-provider history. Duplicate submissions do not
inflate counts, manual status remains authoritative, and unknown or explicitly
excluded topics are omitted. These history counts are sent to AI under the
current always-on `personalized-coaching-rag-v2` policy. A policy or evidence
change invalidates a cached recommendation batch so ranking can react
appropriately.
The AI service retrieves reference knowledge for candidate-relevant focus,
preferred, and observed-attempt topics before lower-priority catalog topics;
it does not scatter a retrieval query across every tag in the shortlist.

Express validates every selected ID against the original candidate set and
attaches the canonical URL itself. Reasons are bounded and rejected if they
contain URLs, contact-like data, UUIDs, or copied slices of private notes.

FastAPI repairs model output instead of discarding it whole: unknown and
duplicate IDs are dropped, an unsafe reason (link, contact data, identifier,
or copied preference/memory text) is replaced with a reason built only from
candidate metadata and learner signals, and any shortfall is filled from the
deterministic shortlist order Express supplied. If fewer than half of the
expected picks are valid model choices, the whole ranking falls back to
`invalid_output`. Unsafe text therefore never reaches Express, and a single
malformed item no longer discards an otherwise useful AI ranking. CSES
candidates are accepted by the ranking contract. `AI_RANKING_TIMEOUT_MS`
defaults to 60 seconds: the local `qwen3:8b-q4_K_M` ranks 40 candidates in
about 25 s on a 16 GB laptop (2,500 input and 500 output tokens), and shorter
limits (the earlier 8 s and 25 s) silently turned most rankings into
deterministic fallbacks. Batches rotate once a day, so the wait is paid once.

### Fallback behavior

AI failure is non-fatal. Deterministic ranking remains available for:

- missing AI configuration;
- timeout;
- unavailable FastAPI;
- invalid JSON or schema;
- model errors; and
- audit persistence failures.

### Learner activity digest and memory from synced data

`LearnerActivityService` computes `learner-activity-v1` (shared contract
`LearnerActivityDigestSchema`) from every stored submission, solve, contest,
and rating, plus catalog titles, ratings, and topics. It holds:

- totals: solved, attempted but unsolved, submissions, acceptance rate,
  first-try rate, and submissions per solve;
- per linked account: counts, rating, whether the stored history is complete,
  and whether it came through the browser connector;
- the verdict mix and failure patterns (each failure verdict's share and the
  topics where it happens);
- topic strengths (most solved) and weaknesses (topics whose failure rate is
  above the learner's own average, weighted by volume);
- solved-rating medians and maximum per provider, activity windows and streak,
  recent contests, languages, the ten latest solves, and ten open attempts.

It is recomputed after every successful sync job, connector upload, and
provider-history deletion, and stored in `core.learner_activity_digests`. A
SHA-256 hash of its content, excluding time windows, skips saves when nothing
changed. `GET /api/me/activity-digest` returns it.

When the content changes, `describeActivityChange` writes a short factual note
(for example, new solves with titles and topics, a burst of failures, newly
weak or strong topics, contest results) to `core.learner_activity_changes`
and queues a `memory_generation` outbox job with evidence type
`provider_activity`. The first digest produces a baseline note. The memory
worker sends the note under the current always-on AI policy, as for other
evidence. FastAPI accepts `provider_activity` as automatic-memory evidence and
the memory prompt turns it into at most three durable memories (topic
strengths or weaknesses, mistake patterns, difficulty calibration, contest
performance, pace, milestones). Notes never include handles, IDs, or URLs.

### Coach context, live refresh, and answer quality

- **Compact context.** The coach's model context carries the stored activity
  digest (`activityDigest`) instead of the per-request profile digest, and
  omits chart-only or duplicated data: analytics, activity-trend points, and
  per-provider topic counts. Recent rows are capped (8 submissions, 8 solves,
  5 timers, 10 dismissals). Roadmap topics carry their assessment, reason,
  evidence counts, and suggestion IDs; the suggested problems' titles are in
  `availablePresentationProblems`. Server-built charts still use the full
  snapshot.
- **Memory first, then live data.** The prompt orders learner facts as
  `activityDigest`, then memories, then query tools. The
  `refresh_platform_data` tool (enabled when `CORE_API_URL` and
  `INTERNAL_SERVICE_TOKEN` are set) calls `POST /internal/coach/live-refresh`.
  `CoachLiveRefreshService` fetches the newest data from Codeforces, CodeChef,
  or LeetCode within 25 seconds, stores it, refreshes the digest, and returns
  the ten latest submissions with updated totals. Each learner and provider
  refreshes at most once per 3 minutes, and at most once per provider per
  turn; a refresh never moves the sync cursor. CSES reports its last connector
  upload instead.
- **Answers that start with the answer.** The prompt forbids greetings,
  praise, restating the question, and opening with a recap of ratings or
  totals, and asks for learner numbers only where they change the advice.
  `coachingGuidance.avoidOpenings` lists the first sentence of the coach's last
  five replies, which it must not reuse or paraphrase.
- **Fewer "unavailable" turns.** The tool-using agent has
  `COACH_AGENT_TIMEOUT_SECONDS` (75 by default). When it runs out, one
  structured call with low reasoning effort answers from the same context
  instead of failing the turn.

### AI audit and memory

AI audit rows contain model/version, fallback state, latency, optional token and
cost estimates, and a keyed fingerprint of an eligible note. They do not store
raw prompts or private note text. Learner memory uses bounded evidence, explicit
confidence/strength thresholds, retrieval limits, and learner-controlled
archive/restore/delete actions.

The evaluation harnesses validate ranking scenarios and memory retrieval locally;
they do not prove production model quality, billing, latency, or browser auth.

---

## 16. Frontend engineering

### Data fetching

- TanStack Query owns server state.
- Query keys include the authenticated user and normalized filters.
- Catalog filters are stored in `URLSearchParams`.
- The frontend calls only normalized `/api/*` endpoints.
- API responses are runtime-validated with shared Zod schemas.
- Provider freshness warnings are distinct from TanStack Query cache freshness.

### Navigation and links

- Use real anchors for external navigation and buttons for actions.
- Open new tabs with `rel="noopener noreferrer"`.
- Display provider attribution beside every external problem.
- Outbound provider navigation does not record a learner action.

### State presentation

Every provider-facing view has intentional states for loading, empty, success,
partial, stale, rate-limited, blocked, and error. A blocked provider is never
shown as zero solved problems. Temporary notifications expire after a short
period and do not accumulate indefinitely.

### Visual system

The application keeps the established dark, compact, responsive visual system.
New provider filters and pages extend existing patterns rather than replacing
the navigation or interaction model.

- **Icons.** `components/icons/algo-icons.tsx` is the solid AlgoMemtor set used
  everywhere except the top navigation bar and its account menu, which keep the
  line set in `algo-icons-line.tsx`. Solid glyphs cut detail out of the fill
  with a mask and carry an accent "memory node" coloured by `--icon-node`.
- **Motion primitives** (`components/motion/`): `GradientCard` (selected Dashboard
  KPI cards and every top card on Progress and Insights), `RadialRings`
  (Progress platforms), `RadarChart` (dashboard topic mix), `OrbLoader`/`ThinkingOrb` (loading screens), and `AiLoader` (coach
  working state). All respect `prefers-reduced-motion`.
- **Notifications** are dark glass cards with a tone glow, a solid badge, and a
  countdown bar for the four-second auto-dismiss.
- **Recent activity** on the dashboard and Insights lists submissions and solves
  only; contests and rating changes appear in the contest log.

---

## 17. Configuration

Create environment files from the examples and never commit live values.

### Web (`apps/web/.env`)

```text
VITE_CORE_API_URL=http://localhost:3001
VITE_AI_API_URL=http://localhost:8000
VITE_SITE_URL=http://localhost:5173
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_USE_MOCKS=false
```

### Core API (`apps/core-api/.env`)

```text
NODE_ENV=development
PORT=3001
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://algomemtor:algomemtor_local@127.0.0.1:5433/algomemtor
DATABASE_POOL_MAX=10
DATABASE_CONNECTION_TIMEOUT_MS=5000
SUPABASE_URL=
SUPABASE_JWT_ISSUER=
CODEFORCES_API_BASE_URL=https://codeforces.com/api
CODECHEF_API_BASE_URL=https://www.codechef.com
LEETCODE_GRAPHQL_URL=https://leetcode.com/graphql
PROVIDER_CACHE_TTL_SECONDS=3600
PROVIDER_TIMEOUT_MS=8000
PROVIDER_MAX_ATTEMPTS=2
PROVIDER_CATALOG_CACHE_TTL_SECONDS=21600
PROVIDER_CONTEST_CACHE_TTL_SECONDS=900
PROVIDER_CONTENT_CACHE_TTL_SECONDS=2592000
CODEFORCES_MIN_REQUEST_INTERVAL_MS=2100
CODECHEF_MIN_REQUEST_INTERVAL_MS=1000
LEETCODE_MIN_REQUEST_INTERVAL_MS=1000
PROVIDER_CODEFORCES_ENABLED=true
PROVIDER_CODECHEF_ENABLED=true
PROVIDER_LEETCODE_ENABLED=true
PROVIDER_CODEFORCES_CATALOG_ENABLED=true
PROVIDER_CODEFORCES_CONTENT_ENABLED=true
PROVIDER_CODEFORCES_PROFILE_ENABLED=true
PROVIDER_CODEFORCES_ACTIVITY_ENABLED=true
PROVIDER_CODEFORCES_CONTESTS_ENABLED=true
PROVIDER_CODECHEF_CATALOG_ENABLED=true
PROVIDER_CODECHEF_CONTENT_ENABLED=true
PROVIDER_CODECHEF_PROFILE_ENABLED=true
PROVIDER_CODECHEF_ACTIVITY_ENABLED=true
PROVIDER_CODECHEF_CONTESTS_ENABLED=true
PROVIDER_LEETCODE_CATALOG_ENABLED=true
PROVIDER_LEETCODE_CONTENT_ENABLED=true
PROVIDER_LEETCODE_PROFILE_ENABLED=true
PROVIDER_LEETCODE_ACTIVITY_ENABLED=true
PROVIDER_LEETCODE_CONTESTS_ENABLED=true
CODECHEF_CATALOG_LIMIT=5000
LEETCODE_CATALOG_PAGE_SIZE=100
LEETCODE_CATALOG_MAX_PAGES=10
PROVIDER_ACTIVITY_MIN_REFRESH_INTERVAL_MS=900000
AI_API_URL=http://localhost:8000
CORE_API_URL=http://localhost:3001
AI_RANKING_TIMEOUT_MS=60000
INTERNAL_SERVICE_TOKEN=
PROGRESS_ENABLED=true
MEMORY_GENERATION_ENABLED=true
MEMORY_RAG_ENABLED=true
```

CSES uses the fixed allowlisted host and does not require an account credential
or CSES environment secret.

### AI API (`apps/ai-api/.env`)

```text
APP_ENV=development
PORT=8000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql+psycopg://algomemtor:algomemtor_local@127.0.0.1:5433/algomemtor
SUPABASE_URL=
SUPABASE_JWT_ISSUER=
AI_PROVIDER=local
AI_DEVELOPMENT_ALLOW_CLOUD_FALLBACK=false
LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_AI_MODEL=qwen3:8b-q4_K_M
LOCAL_AI_CONTEXT_TOKENS=16384
LOCAL_AI_THINKING=off
LOCAL_AI_KEEP_ALIVE_MINUTES=60
LOCAL_AI_SINGLE_CALL=true
LOCAL_EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B
LOCAL_EMBEDDING_DIMENSIONS=1024
COACH_THINKING_LEVEL=high
COACH_MAX_OUTPUT_TOKENS=4096
COACH_AGENT_ENABLED=true
COACH_AGENT_MAX_STEPS=4
# Optional: coach model requests per minute for this process (0 = no cap)
COACH_MODEL_REQUESTS_PER_MINUTE=0
COACH_RESPONSE_TIMEOUT_SECONDS=140
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_FAST_MODEL=openai/gpt-oss-20b
AI_STRONG_MODEL=openai/gpt-oss-120b
AI_HUGE_CONTEXT_MODEL=qwen/qwen3.8-flash
AI_EMBEDDING_MODEL=qwen/qwen3-embedding-8b
AI_EMBEDDING_DIMENSIONS=1024
AI_WEB_SEARCH_MODEL=openai/gpt-oss-20b
AI_WEB_SEARCH_ENGINE=parallel
AI_BUDGET_TRACKING_ENABLED=true
AI_MONTHLY_SOFT_BUDGET_USD=5.00
AI_BUDGET_WARNING_PERCENT=80
INTERNAL_SERVICE_TOKEN=
# Coach live platform refresh (blank URL disables it) and agent time budget
CORE_API_URL=http://localhost:3001
COACH_LIVE_REFRESH_TIMEOUT_SECONDS=30
COACH_AGENT_TIMEOUT_SECONDS=75
EMBEDDING_TIMEOUT_SECONDS=30
MEMORY_MIN_CONFIDENCE=0.75
MEMORY_MIN_EVIDENCE_STRENGTH=0.75
MEMORY_SIMILARITY_THRESHOLD=0.75
MEMORY_RETRIEVAL_LIMIT=5
MEMORY_AUDIT_TIMEOUT_SECONDS=0.5
MEMORY_GENERATION_ENABLED=true
MEMORY_RAG_ENABLED=true
COACH_KNOWLEDGE_RAG_ENABLED=true
COACH_WEB_GROUNDING_ENABLED=true
COACH_WEB_GROUNDING_TIMEOUT_SECONDS=20
INTERNAL_RATE_LIMIT_PER_MINUTE=120
MENTOR_THINKING_LEVEL=low
MENTOR_MAX_OUTPUT_TOKENS=16384
MENTOR_TIMEOUT_SECONDS=110
# Solution Explorer thinking depth.
SOLUTION_THINKING_LEVEL=medium
# Page reading for links; blocked pages are read once through the reader.
WEB_READER_PROXY_URL=https://r.jina.ai/
WEB_READER_PROXY_API_KEY=
WEB_READER_TIMEOUT_SECONDS=10
WEB_READER_CACHE_SECONDS=1800
WEB_SEARCH_TIMEOUT_SECONDS=40
```

`INTERNAL_SERVICE_TOKEN` must match between core and AI when HTTP ranking is
enabled. Empty AI/LLM configuration intentionally produces a safe fallback.

---

## 18. Local setup and daily operation

### Prerequisites

- Node.js 22 or newer;
- npm 11 or compatible workspace npm;
- Python 3.14 or compatible Python;
- `uv`;
- Docker and Docker Compose; and
- a Supabase project for live authentication.

### Install

```bash
npm install
uv sync --project apps/ai-api
cp apps/web/.env.example apps/web/.env
cp apps/core-api/.env.example apps/core-api/.env
cp apps/ai-api/.env.example apps/ai-api/.env
```

Fill only the required local values. Never overwrite an existing environment
file without reviewing it first.

### Database

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

`db:migrate` applies Prisma core migrations and then Alembic AI migrations.
`db:seed` idempotently seeds normalized topics.

```bash
npm run db:down
```

The compose database uses the `pgvector/pgvector` image. A local PostgreSQL
installation must have the pgvector extension installed and enabled before
the Alembic migrations run. For Homebrew PostgreSQL, install `pgvector`, start
the service, and run `CREATE EXTENSION IF NOT EXISTS vector` once as a database
administrator.
Compose publishes PostgreSQL on `127.0.0.1:5433`, separate from a local
Homebrew server on `5432`. Both API services and workers must use the same
database URL target; otherwise linked accounts and their sync jobs can appear
in one database while a worker processes another.

### Run all services

```bash
npm run dev
```

The root command starts the web app, Express API, FastAPI, memory worker, and
provider-sync worker.

### Run services separately

```bash
npm run dev:web
npm run dev:core
npm run dev:ai
npm run dev:worker
npm run dev:provider-worker
```

| Service         | Local address                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------- |
| React/Vite      | `http://localhost:5173`                                                                             |
| Express         | `http://localhost:3001`                                                                             |
| FastAPI         | `http://localhost:8000`                                                                             |
| Memory worker   | PostgreSQL outbox consumer; calls the protected core coach-refresh endpoint for scheduled check-ins |
| Provider worker | PostgreSQL provider-job consumer; no HTTP endpoint                                                  |

### Supabase setup

Configure email/password authentication and the Google provider, set the site
URL to the frontend origin, and allow the exact `/dashboard`, `/settings`, and
`/reset-password` callbacks for local and production origins. Enable manual
identity linking in Supabase Auth so an existing signed-in learner can connect
Google from Settings. Password reset links return to `/reset-password` and
update the password only after Supabase establishes a recovery session. Set
`SUPABASE_JWT_ISSUER` to `<SUPABASE_URL>/auth/v1` in both APIs.

### Production deployment (Docker)

Three images are built from the repository root; `docker-compose.prod.yml`
wires them to PostgreSQL with pgvector:

| Service           | Image / target                                  | Role                                                                                          |
| ----------------- | ---------------------------------------- | ---- |
| `postgres`        | `pgvector/pgvector:pg16`                        | One database; Prisma owns `core`, Alembic owns `ai` (memories, embeddings, audits, knowledge) |
| `migrate-core`    | `apps/core-api/Dockerfile`, `migrate`           | One-shot `prisma migrate deploy` plus the idempotent topic seed                               |
| `migrate-ai`      | `apps/ai-api/Dockerfile`                        | One-shot `alembic upgrade head`, after `migrate-core`                                         |
| `ai-api`          | `apps/ai-api/Dockerfile`                        | FastAPI (uvicorn): ranking, coach agent, memory, embeddings                                   |
| `core-api`        | `apps/core-api/Dockerfile`, `runtime`           | Express API (production dependencies only)                                                    |
| `memory-worker`   | same image, `node dist/memory-worker.js`        | Memory generation outbox and scheduled check-ins                                              |
| `provider-worker` | same image, `node dist/provider-sync-worker.js` | Hourly linked-account sync                                                                    |
| `web`             | `apps/web/Dockerfile`                           | Vite build plus browser-connector zips, served by unprivileged nginx on 8080                  |

```bash
cp deploy/compose.env.example .env           # public URL, DB password, shared token
cp deploy/core.env.example deploy/core.env   # core API settings
cp deploy/ai.env.example deploy/ai.env       # model keys and AI settings
docker compose -f docker-compose.prod.yml up -d --build
```

- Only `web` publishes a port. nginx serves the SPA (hashed assets cached for a
  year, the HTML shell never), proxies `/api/` to `core-api` with a 180 s read
  timeout for coach turns, and returns 404 for `/internal/*`. Put TLS in front
  (managed load balancer, Caddy, or Traefik) and use that HTTPS origin as
  `PUBLIC_SITE_URL`; it is baked into the web build as the site and API origin
  and into the browser connector.
- Services talk over the private compose network (`http://ai-api:8000`,
  `http://core-api:3001`). `AI_API_URL` accepts HTTPS, HTTP loopback, or HTTP
  to a single-label private service name only.
- Browser-safe values (`SUPABASE_URL`, the publishable key, `PUBLIC_SITE_URL`)
  are build arguments; secrets (`OPENROUTER_API_KEY`,
  `INTERNAL_SERVICE_TOKEN`, the database password) are runtime environment only
  and never enter an image. Filled-in `.env` and `deploy/*.env` files are
  git-ignored.
- Containers run as non-root users and expose `/health` (`/healthz` for web)
  health checks; the workers depend on healthy APIs, and migrations must
  complete before either API starts.
- Fund the OpenRouter account in production. Provider limits are a common cause of
  “Coach is unavailable” turns; set `COACH_MODEL_REQUESTS_PER_MINUTE` to the
  project's RPM quota.
- Add the production `/dashboard` callback to the Supabase URL allowlist.
  Back up the `postgres_data` volume (or use a managed PostgreSQL with the
  `vector` extension and point both `DATABASE_URL`s at it).

---

## 19. Testing and verification

### JavaScript/TypeScript workspace

```bash
npm run typecheck
npm run test
npm run lint
npm run format:check
npm run build
```

Focused commands:

```bash
npm run typecheck:contracts
npm run typecheck:web
npm run typecheck:core
npm run test:contracts
npm run test:web
npm run test:core
```

The Test Case Visualizer engines are covered by
`apps/web/src/features/visualizer/**/*.test.ts`: the C++ and Java interpreters
against contest programs, a differential corpus checked against real g++,
OpenJDK and CPython output, every gallery example in every language, the scene
model (views, keys, graphs, trees, narration), and the Python tracer inside
real Pyodide under Node (the first run loads the runtime from `node_modules`,
a few seconds).

### Python service

```bash
uv run --project apps/ai-api pytest apps/ai-api/tests
uv run --project apps/ai-api ruff check apps/ai-api
uv run --project apps/ai-api ruff format --check apps/ai-api
```

### Provider adapter tests

Fixtures cover:

- valid, missing, malformed, partial, paginated, blocked, rate-limited, and
  changed-schema responses;
- Codeforces normalization and URL safety;
- CodeChef recent rows and problem tag enrichment;
- LeetCode profile skill counts and recent question tag hydration; and
- CSES public catalog parsing and canonical links.

### Required safety tests

- SSRF and unapproved-host attempts;
- unsafe redirects and oversized response bodies;
- HTML/script injection in provider content;
- accidental cookie, authorization-header, or raw-payload logging;
- unknown provider/problem IDs from AI output;
- stale-cache preservation after provider failure;
- sync job leases, retries, cooldowns, deduplication, and deletion; and
- exact arithmetic for combined provider totals.

### Live smoke checks

Live checks are opt-in and must use public handles only. They should verify a
known public user, missing user, catalog page, contest list, and public problem
for each provider. Redact payloads and never require credentials. Live smoke
checks do not replace unit tests or authenticated browser acceptance.

### Browser acceptance

Verify manually or with browser tests:

- signup, login, refresh/session restoration, logout;
- onboarding and provider linking;
- queued sync and status polling;
- provider filters and CSES catalog;
- profile skill/tag analytics;
- activity/contest pagination;
- recommendation fallback;
- progress, bookmark, dismissal, memory, and deletion flows;
- mobile layouts and keyboard navigation.

---

## 20. Operations and troubleshooting

### Analytics shows “Unable to load analytics”

1. Confirm the core API is running on port 3001.
2. Inspect the core API log for the stable error code.
3. Verify the browser has a valid Supabase session.
4. Verify database migrations have been applied.
5. Check that the API response satisfies the shared contract, including every
   provider key (`codeforces`, `codechef`, `leetcode`, and `cses`).
6. Retry after restarting the core API if source code changed under a watch
   process.

### Provider data is empty or stale

- Confirm the relevant provider and capability flags are enabled.
- Check the provider sync-status endpoint.
- Inspect `lastErrorCode`, `nextRunAt`, completeness, and stale state.
- Do not interpret a block or login wall as zero solved problems.
- Wait for the request gate/cooldown before retrying.

### CodeChef activity has accepted rows but no tags

The recent row is preserved as partial when the contest problem JSON request is
unavailable. Check provider availability and schema health. The adapter does
not invent tags from titles or aggregate counts.

### LeetCode has profile topic counts but few concrete solved problems

This is expected. The profile query exposes aggregate skill counts, while the
public recent submission query exposes only a bounded recent window. Complete
question-level history requires an approved connector or import.

### CSES has catalog data but no profile

This is expected. CSES is catalog-only in the current implementation. Account
history is not inferred from public task pages.

### AI recommendations fall back

Check `AI_API_URL`, matching `INTERNAL_SERVICE_TOKEN`, FastAPI health, AI provider
configuration, timeout settings, and audit/database availability. Fallback is a
supported product state, not a data-loss condition.

### Database migration problems

Confirm PostgreSQL is running, `DATABASE_URL` points to the intended database,
and that Prisma and Alembic are being run in their documented order. Never use a
destructive reset against a shared database.

---

## 21. Known limitations and next work

### Current limitations

1. LeetCode concrete solved activity is bounded by the 20-submission public
   feed; it is not a complete lifetime history. CodeChef reads the whole public
   feed, but a first backfill can take several hourly syncs because of rate
   limits.
2. LeetCode profile aggregate tags have counts but not a historical
   question-to-tag mapping.
3. CodeChef tags depend on the public problem record; problems published
   without algorithm tags stay untagged.
4. CSES and full LeetCode history require the browser connector, which syncs
   only while the learner's browser runs, and its parsers must track provider
   page changes. The CSES submission parser and Helsinki time handling have
   not been checked against a live signed-in account.
5. Provider terms, robots policies, response schemas, and anti-bot behavior can
   change; capabilities need ongoing review and kill switches.
6. A linked handle is unverified until its owner completes the ownership-code
   check; a verified owner cannot yet reclaim a handle that another learner
   linked first.
7. Live provider, production Supabase, deployment, and 1,000-identity load
   evidence are environment-dependent and must not be claimed from local tests.
8. Full problem content remains capability- and permission-dependent; premium
   and private material is metadata-and-link only.
9. Mentor tools need a readable statement. Codeforces problem pages can return
   `PROVIDER_BLOCKED` from some networks; the Doubt Helper then asks for the
   pasted statement, and the Solution Explorer works from title and tags only.
10. Contest analysis infers time use from submission timestamps. Only
    Codeforces exposes the full contest problem list, so unattempted problems
    are flagged for Codeforces contests only.
11. Google sign-in and "Connect Google" require the Google provider (and manual
    identity linking) to be enabled in the Supabase Dashboard, with
    `/dashboard`, `/settings` and `/reset-password` on the redirect allowlist.
12. The Test Case Visualizer runs C++ and Java in interpreters for documented
    subsets (C++: no pointers to pointers, inheritance or custom namespaces,
    unordered containers iterate in insertion order; Java: single file, a
    library subset, `Set.of`/`Map.of` not randomised). Not built yet:
    comparing two runs and named test cases. The AI Debugger has not been
    checked against a live model.

### Safe next work

- Add a provider-approved API or user-controlled local connector for complete
  question-level history.
- Add a versioned LeetCode skill-level contract if the UI needs to preserve the
  Advanced/Intermediate/Fundamental grouping separately.
- Add durable CSES catalog refresh health and optional user-import validation.
- Add route-level analytics contract tests to prevent provider-enum regressions.
- Run live browser acceptance and production migration checks.
- Perform the planned provider load test with at least 1,000 linked identities.
- Review provider terms, robots, attribution, retention, and applicable law
  before public deployment.

---

## 22. Engineering checklist

Before merging a change:

- [ ] `git status --short --branch` was checked first.
- [ ] Unrelated dirty work was preserved.
- [ ] Shared contracts changed before producers/consumers.
- [ ] Provider payloads are validated and provenance is recorded.
- [ ] Canonical URLs are server-constructed from allowlisted identifiers.
- [ ] Partial/stale/blocked states are honest.
- [ ] No provider credentials, cookies, CSRF tokens, CAPTCHA data, or source
      code entered logs, fixtures, contracts, or storage.
- [ ] AI output is bounded and candidate IDs are validated.
- [ ] Relevant tests, type-checks, lint/format checks, and builds pass.
- [ ] Database migrations are present for schema changes.
- [ ] Browser/live acceptance gaps are explicitly reported.
- [ ] No commit, push, reset, clean, or destructive database operation was
      performed without explicit authorization.

This document should be updated whenever a public contract, provider source,
environment variable, data boundary, route, persistence model, or user-facing
feature changes.

---

## 23. Source-traced implementation map

This section maps user-visible behavior to the files that implement it. Use it
when planning a change so that contracts, producers, consumers, persistence,
and tests are updated together.

### 23.1 Shared contract files

| File                                                | Owns                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/shared-contracts/src/problem-catalog.ts`  | Provider keys, problem summaries, queries, pagination, freshness, warnings |
| `packages/shared-contracts/src/platform-data.ts`    | Profiles, submissions, solved observations, ratings, contests, analytics   |
| `packages/shared-contracts/src/provider-account.ts` | Linkable providers, account consent, handle/profile URL validation         |
| `packages/shared-contracts/src/learner-profile.ts`  | Onboarding answers and structured learner preferences                      |
| `packages/shared-contracts/src/recommendations.ts`  | Candidate ranking, recommendation batches, feedback, dismissal             |
| `packages/shared-contracts/src/progress.ts`         | Manual statuses, actions, reflections, timers, progress analytics          |
| `packages/shared-contracts/src/learner-memory.ts`   | Memory records, evidence, lifecycle actions, always-on AI policy           |
| `packages/shared-contracts/src/coach.ts`            | Coach conversations, roadmap, action proposals, citations, and rich blocks |
| `packages/shared-contracts/src/index.ts`            | Public package exports consumed by web and core API                        |

The normal change order is: update the shared schema, update the adapter or API
producer, update repository serialization, update React consumers and mocks,
then add contract and behavior tests.

### 23.2 Core API composition

`apps/core-api/src/app.ts` is the route composition root. It receives dependency
implementations from `apps/core-api/src/server.ts`, applies authentication and
validation middleware, calls services, and serializes shared-contract responses.
It should not contain provider-specific parsing or raw external HTTP calls.

| Module                                                  | Responsibility                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/auth/require-auth.ts`                              | Express middleware that requires a verified Supabase subject                  |
| `src/auth/supabase-jwt.ts`                              | JWKS-backed JWT verification and claim checks                                 |
| `src/config/provider-config.ts`                         | Provider URLs, capability switches, gates, limits, and environment parsing    |
| `src/config/ai-config.ts`                               | AI URL, timeout, token, model, and feature configuration                      |
| `src/integrations/providers/provider-http-client.ts`    | HTTPS allowlists, timeout, bounded bodies, retries, safe errors               |
| `src/integrations/providers/provider-adapter.ts`        | Capability names/statuses and common adapter shape                            |
| `src/integrations/providers/problem-provider.ts`        | Catalog/detail/content provider interface                                     |
| `src/integrations/providers/contest-provider.ts`        | Contest provider interface and freshness contract                             |
| `src/integrations/providers/cached-catalog-provider.ts` | In-memory/durable catalog refresh, cache, filtering, stale fallback           |
| `src/integrations/providers/cached-contest-provider.ts` | Contest cache, refresh, and stale handling                                    |
| `src/integrations/providers/problem-filters.ts`         | Search, topic, difficulty, rating, and pagination filtering                   |
| `src/integrations/providers/provider-html-sanitizer.ts` | Allowed HTML, URL attributes, text, sections, and examples                    |
| `src/services/problem-catalog-service.ts`               | Selects provider(s), merges catalogs, topics, and detail/content results      |
| `src/services/contest-catalog-service.ts`               | Selects providers and merges contest results                                  |
| `src/services/provider-account-service.ts`              | Link/disconnect account validation and serialization                          |
| `src/services/provider-account-stats-service.ts`        | User-triggered aggregate public-stat refresh and stale preservation           |
| `src/services/provider-profile-service.ts`              | Profile snapshot refresh and latest-profile selection                         |
| `src/services/provider-activity-service.ts`             | Consent-gated Codeforces verified activity                                    |
| `src/services/provider-sync-service.ts`                 | Manual sync job creation, cooldown, status, history deletion                  |
| `src/services/provider-sync-worker.ts`                  | Lease-based profile/activity/statistics worker and scheduling                 |
| `src/services/recommendation-ranking.ts`                | Deterministic candidate scoring, diversity, reasons, and history              |
| `src/services/recommendation-service.ts`                | AI request, response validation, persistence, fallback, feedback              |
| `src/services/progress-service.ts`                      | Manual actions, status reduction, history, analytics, reflections, timers     |
| `src/services/coach-service.ts`                         | Deterministic roadmap, bounded RAG snapshot, rich composer, fallback, actions |
| `src/integrations/ai/ai-coach-client.ts`                | Internal coach JSON contract and validated AI transport                       |
| `src/repositories/coach-repository.ts`                  | Owner-scoped coach persistence and rich message serialization                 |
| `src/repositories/provider-data-repository.ts`          | Submissions, solved observations, ratings, contest participation              |
| `src/repositories/provider-profile-repository.ts`       | Profile snapshot persistence and latest selection                             |
| `src/repositories/provider-sync-repository.ts`          | Sync states/jobs, leases, retries, cursors, and deletion                      |
| `src/repositories/external-problem-cache-repository.ts` | Durable normalized problem catalog                                            |
| `src/repositories/problem-content-cache-repository.ts`  | Durable permitted sanitized content                                           |
| `src/repositories/external-contest-cache-repository.ts` | Durable contest catalog                                                       |
| `src/database/prisma.ts`                                | Prisma client construction and database lifecycle                             |

### 23.3 Provider adapter files

Each provider directory contains the provider class, raw schemas, canonical URL
builder, and tests. Account adapters are kept separate from global catalogs.

```text
integrations/codeforces/
  codeforces-provider.ts             catalog metadata and filtering
  codeforces-normalizer.ts           IDs, tags, topics, difficulty
  codeforces-contest-provider.ts     contest list normalization
  codeforces-schemas.ts              raw response validation
  codeforces-url.ts                  canonical problem URLs

integrations/codechef/
  codechef-provider.ts               catalog metadata
  codechef-contest-provider.ts       contest list normalization
  codechef-schemas.ts                raw JSON validation
  codechef-url.ts                    canonical problem URLs

integrations/leetcode/
  leetcode-provider.ts               GraphQL catalog and permitted content
  leetcode-contest-provider.ts       contest list normalization
  leetcode-schemas.ts                question/content validation
  leetcode-url.ts                    canonical problem URLs

integrations/cses/
  cses-provider.ts                   public HTML catalog-only adapter
  cses-provider.test.ts              parser, URL, and partial-result tests

integrations/provider-accounts/
  *-profile.ts                       public profile snapshots
  *-public-stats.ts                  aggregate solved totals
  *-activity.ts                      bounded submissions/accepted observations
  provider-public-stats.ts           common account adapter interfaces
```

### 23.4 FastAPI implementation map

| Path                                                                 | Responsibility                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/ai-api/app/coach_service.py`                                   | Knowledge/memory retrieval, conditional web search, routed AI flow, audits |
| `apps/ai-api/app/knowledge_base.py`                                  | Versioned original CP/DSA reference chunks and lexical fallback            |
| `apps/ai-api/app/knowledge_repository.py`                            | Alembic knowledge index seeding and hybrid keyword/vector retrieval        |
| `apps/ai-api/app/web_grounding.py`                                   | De-identified query and OpenRouter web-search citation extraction          |
| `apps/ai-api/app/coach_models.py`                                    | Strict coach output, citation, proposal, and safety contracts              |
| `apps/ai-api/app/pedagogy.py`                                        | Frustration/momentum signals, teaching modes, SM-2, mastery, prerequisites |
| `apps/ai-api/app/rate_limit.py`                                      | Bounded process-local protection for internal AI routes                    |
| `apps/ai-api/app/memory_consolidation.py`                            | Confidence decay and safe memory-consolidation grouping helpers            |
| `apps/ai-api/alembic/versions/202609171300_coach_knowledge.py`       | AI knowledge source/chunk/vector tables                                    |
| `apps/ai-api/alembic/versions/202609181000_coach_audit_retrieval.py` | Retrieval-lane audit flags                                                 |
| `apps/ai-api/alembic/versions/202609181300_curriculum.py`            | Hint ladders, prerequisite graph, topic mastery, contest performance       |

### 23.5 Frontend implementation map

| Path                                                           | Responsibility                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/routes/AppRouter.tsx`                            | Route table and public/protected screen selection                             |
| `apps/web/src/routes/ProtectedRoute.tsx`                       | Onboarding/auth gate for learner screens                                      |
| `apps/web/src/features/auth/*`                                 | Supabase session, token refresh, authenticated fetch                          |
| `apps/web/src/features/platform/api.ts`                        | Central platform API calls and response parsing                               |
| `apps/web/src/features/platform/hooks.ts`                      | TanStack Query hooks for catalog/profile/activity/analytics                   |
| `apps/web/src/features/platform/components/provider-labels.ts` | Provider labels and linkable-provider options                                 |
| `apps/web/src/features/profile/*`                              | Learner profile and provider-account UI                                       |
| `apps/web/src/pages/ProblemsPage.tsx`                          | Catalog filters, pagination, and problem cards                                |
| `apps/web/src/pages/ProblemDetailPage.tsx`                     | Detail metadata, status, tags, and outbound link                              |
| `apps/web/src/pages/RecommendationsPage.tsx`                   | Recommendation feed, refresh, feedback, dismissal                             |
| `apps/web/src/pages/ContestsPage.tsx`                          | Contest catalog and participation view                                        |
| `apps/web/src/pages/AnalyticsPage.tsx`                         | Provider totals and topic/language/rating distributions                       |
| `apps/web/src/pages/ProgressPage.tsx`                          | Recent practice analytics and charts                                          |
| `apps/web/src/pages/MemoryPage.tsx`                            | Learner memory review and lifecycle controls                                  |
| `apps/web/src/pages/CoachPage.tsx`                             | Saved coach threads, roadmap, actions, and rich message rendering             |
| `apps/web/src/features/coach/components/CoachRichContent.tsx`  | Accessible charts, tables, timelines, trusted problems, citations, follow-ups |
| `apps/web/src/features/coach/*`                                | Coach API calls and TanStack Query state                                      |
| `apps/web/src/mocks/handlers.ts`                               | MSW implementation of the same normalized API shape                           |
| `apps/web/src/pages/TestCaseVisualizerPage.tsx`                | Visualizer landing, stage, playback, AI panel, and mentor handoffs            |
| `apps/web/src/features/visualizer/scene/*`                     | Scene model: views per variable, stable keys, layouts, narration, call tree   |
| `apps/web/src/features/visualizer/stage/*`                     | Animated views, gallery, composer, drawer, and playback bar                   |
| `apps/web/src/features/visualizer/ai/*`                        | AI Debugger panel, API client, and run digest                                 |
| `apps/web/src/features/visualizer/engines/java/*`              | Java lexer, parser, interpreter dialect, and standard library subset          |
| `apps/web/src/features/visualizer/engines/corpus/*`            | Programs with outputs from real g++, OpenJDK and CPython                      |
| `apps/web/src/features/visualizer/trace.ts`                    | Execution-trace format shared by the engines and the UI                       |
| `apps/web/src/features/visualizer/engines/cpp/*`               | Contest C++ preprocessor, parser, interpreter, library, and snapshots         |
| `apps/web/src/features/visualizer/engines/python/*`            | Pyodide tracer (`tracer.py`) and its TypeScript wrapper                       |
| `apps/web/src/features/visualizer/worker/*`                    | Web Worker that runs both engines off the main thread                         |
| `apps/web/src/features/visualizer/analysis.ts`                 | Step descriptions, changes, loop compression, pointers, output comparison     |
| `apps/web/src/features/visualizer/handoff.ts`                  | Validated navigation-state handoffs and the tab-only draft                    |
| `apps/web/src/features/pet/*`                                  | The AI Coach's on-page pets: catalog, player, poses, chat panel, page reader  |

The coach pet (2026-09-26) is the AI Coach's visual body on every signed-in
page, not a separate chatbot. It is on by default, sits bottom-right, can be
dragged, and is turned off or switched per browser in Settings → Appearance
(`algomemtor-pet-mello` and `algomemtor-pet-choice` in `localStorage`). Four
pets share one behaviour: Mello, Kai, Luna and Kai (female) (`pets.ts`). Their
sprites are 132x104 frame strips built from each pet's concept art (and, for
Mello's hover, the reference video), laid out as `[enter][loop][exit]` in
`assets/<pet>/<pose>.webp`. The player walks a small pose tree (poses under
idle; awe under greet, working under thinking, teaching under idea, sleeping
under sleepy) so every change eases through in-between frames, and each frame
fades in over the last. The hover poses start and stop at once, without
in-between frames. Poses and what triggers them: greet (the mouse moving
anywhere on screen, ending 0.25 s after it rests); awe (cursor on the pet,
`/visualizer`); watching (typing in any text field; the head tilts toward the
field, further as the text grows, and settles back to idle 1.5 s after the
last key); scroll (the page or a panel in it scrolling, built from each pet's
Listening card, until 0.9 s after scrolling stops); reading, thinking, then working past
6 s (a coach question); idea then teaching (the answer arrived); working (any
other mutation pending over 0.8 s); success (a success notification); sleepy
after one quiet minute, then sleeping. The pet follows every coach send
through the `['coach', 'send']` mutation key. Asking it uses the existing
coach conversation API in one saved thread; with "Reads this page" on, a
condensed copy of the visible text of `#main-content` (at most 4,000
characters; no form fields, hidden content or `[data-mello-ignore]`) goes as
the turn's `transientContext`, which is never stored.

The AI service recognises that page snapshot by its fixed opening line
(`PAGE_SNAPSHOT_PREFIX` in `coach_intent.py`). A snapshot does not make a turn
deep by itself: an ordinary question about the page runs on the quick budget,
the snapshot counts against the turn's input budget, and a quick page
question skips workspace prefetch. On the local model, page questions share
the single Ollama worker with recommendation ranking, so a question asked
while a ranking runs waits for it.

---

## 24. End-to-end request lifecycles

### 24.1 Loading the unified catalog

```text
ProblemsPage
  -> useProblems(query from URLSearchParams)
  -> fetchProblemCatalog('/api/problems?...')
  -> Express validates catalog query
  -> ProblemCatalogService selects providers
  -> CachedCatalogProvider returns fresh cache or refreshes
  -> provider adapter calls allowlisted source
  -> raw payload is schema-validated
  -> normalizer creates ExternalProblemSummary records
  -> metadata cache persists/upserts records
  -> service filters, sorts, paginates, and adds freshness/warnings
  -> shared schema validates response
  -> React renders cards and provider links
```

Filter state belongs in the URL. A filter change changes the query key and
resets pagination; it must not copy the catalog into a global store.

### 24.2 Linking a provider account

```text
ProviderAccountLinks form
  -> PUT /api/provider-accounts/:provider
  -> requireAuthenticated obtains Supabase subject
  -> request schema validates provider, handle, profile URL, consent
  -> ProviderAccountService constructs canonical profile URL
  -> repository upserts one active identity for learner/provider
  -> prior handle remains archived/history-separated if changed
  -> response returns not_verified account and consent state
```

The link operation records permission to read the configured public scope; it
does not claim that the handle belongs to the learner.

### 24.3 Refreshing a public profile

```text
profile refresh button
  -> POST /api/provider-accounts/:provider/profile/refresh
  -> ProviderProfileService checks active linked account
  -> profile adapter fetches public JSON/GraphQL/HTML
  -> raw response is bounded and validated
  -> normalized ProviderProfile is persisted as a snapshot
  -> provider account's latest statistic/freshness fields update
  -> UI invalidates profile, analytics, and account queries
```

LeetCode's profile adapter requests solved totals, languages, badges, calendar,
contest rating/rank, and all returned `tagProblemCounts` categories. The profile
snapshot is the source used for aggregate topic analytics.

### 24.4 Queued provider activity sync

```text
user enables activity consent
  -> POST /api/provider-accounts/:provider/activity-consent
  -> consent is persisted
manual sync or scheduler
  -> POST /api/provider-accounts/:provider/sync
  -> ProviderSyncService creates idempotent ProviderSyncJob
  -> worker leases queued row
  -> adapter fetches bounded activity
  -> submissions and solved observations upsert by provider keys
  -> Codeforces evidence may append provider-verified status action
  -> sync state and account status update
  -> worker schedules next hourly run
  -> frontend polls sync-status and refreshes activity/analytics
```

CodeChef and LeetCode activity observations remain partial public observations;
they do not turn aggregate totals into complete lifetime evidence.

### 24.5 Loading analytics

```text
AnalyticsPage
  -> useAnalytics(provider filter)
  -> GET /api/analytics
  -> profile snapshots + actions + submissions + solved rows + ratings + contests
  -> with a provider filter, every source (including manual and
     provider-verified solve actions) is scoped to that provider only
  -> provider solved totals are read from latest profile/account totals
  -> concrete solved references are deduplicated by provider and external ID
  -> metadata and solved-observation tags are joined
  -> providers with aggregate profile topic counts use those counts once
  -> remaining providers derive topic counts from concrete metadata
  -> language counts are grouped by family (every C++ build is "C++",
     PyPy/CPython are "Python", every Java version is "Java")
  -> response includes difficulty, languages, ratings, contests, freshness
  -> UnifiedAnalyticsSchema validates response
  -> UI renders distributions and partial/stale qualification
```

### 24.6 Generating recommendations

```text
RecommendationsPage
  -> GET /api/recommendations
  -> RecommendationService loads learner profile, catalog, and actions
  -> deriveRankingProfile normalizes experience, goals, topics, ranges
  -> deriveRecommendationHistory removes solved/dismissed identities
  -> rankRecommendations scores and diversifies candidates
  -> optional FastAPI request sends bounded metadata only
  -> validateAiResponse rejects unknown IDs/unsafe reasons
  -> fallback to deterministic results on any AI failure
  -> repository persists batch/items and metadata
  -> UI renders explanations and safe outbound links
```

#### Recommendation instructions (steering)

The Recommendations page has a "Shape your picks" bar where the learner types
what they want ("no LeetCode, more DP around 1600", "these are too easy",
"skip Sereja and Brackets").

```text
POST /api/recommendations/steering { text }
  -> parseRecommendationSteering (deterministic, clause-aware negation)
     -> onlyProviders / preferProviders / excludeProviders
     -> includeTopics (+ onlyTopics) / excludeTopics
     -> ratingRange (explicit, "around", relative "harder/easier") or difficulty
     -> excludeProblems: titles from the current batch, recorded as dismissals
  -> core.recommendation_steering row (text, directives, applied summary)
  -> under the always-on AI policy: learner memory (user_instruction) proposed + approved
  -> feed regenerated with forceRefresh and returned with the instruction
GET /api/recommendations/steering        -> active instructions (newest first)
DELETE /api/recommendations/steering/:id -> soft-remove, archive its memory
```

Active instructions merge oldest to newest (a newer instruction wins on the
same provider, topic, or rating), are capped at 20, change the batch profile
signature so today's batch is regenerated, and are enforced as hard candidate
filters before optional AI ranking. Their text is also passed to AI ranking as
bounded preference text. Full learner deletion cascades through `core.users`.

---

## 25. Provider transformation details

### 25.1 Codeforces normalization

The raw problemset response contains separate problem and statistics arrays.
`codeforces-normalizer.ts` joins them using a stable problem identity and emits:

- external ID derived from contest ID and problem index, or a safe problemset
  identity;
- title from the provider name;
- native rating as `providerDifficulty`;
- normalized `easy`/`medium`/`hard` band from the current rating policy;
- deduplicated native tags in `providerTags`;
- lower-case slug topics in `topics`;
- solved/submission statistics where available; and
- canonical `codeforces.com/problemset/problem/...` URL.

Invalid contest IDs, indices, hosts, or response records are skipped without
invalidating otherwise valid catalog records.

### 25.2 CodeChef catalog and activity normalization

The catalog adapter validates the public problem envelope, converts native
fields to the shared summary, preserves native rating/difficulty, and builds a
canonical `codechef.com/problems/<code>` URL.

The account activity adapter has two public paths:

1. `/recent/user?page=0&user_handle=<handle>` is read as bounded recent HTML
   content returned by the public route. Rows are parsed for problem code,
   contest code, title, result, language, timestamp, and solution ID.
2. For accepted rows, `/api/contests/<contest>/problems/<code>` is requested.
   `computed_tags` and `user_tags` are concatenated into `providerTags`; topic
   slugs are derived without discarding the native values.

The date parser converts the provider's displayed India-time value into UTC.
Rows without trustworthy time retain `occurredAt: null`. The activity result is
always `partial` because the public page is a bounded window.

### 25.3 LeetCode profile and activity normalization

The profile adapter sends a public GraphQL `matchedUser` query containing:

- `submitStatsGlobal.acSubmissionNum` and `totalSubmissionNum`;
- `languageProblemCount`;
- `tagProblemCounts.advanced`, `.intermediate`, and `.fundamental`;
- badges and submission calendar; and
- contest rating/global ranking.

The adapter validates every count, sums duplicate tag names across the three
categories into `topicCounts`, and preserves provider-native spelling.

The activity adapter sends `recentSubmissionList`, validates each row, converts
timestamps, and treats `statusDisplay === "Accepted"` as accepted. It then
batches up to 50 safe title slugs into aliased public `question` fields to
hydrate all returned `topicTags`. A question-detail failure keeps the activity
row but leaves tags absent and marks the observation partial.

### 25.4 CSES catalog normalization

The CSES adapter fetches one public HTML page and matches problem sections and
task links. Each task becomes:

```text
provider: cses
externalId: numeric task ID as a string
canonicalUrl: https://cses.fi/problemset/task/<id>/
providerTags: ["cses", <section slug>]
topics: ["cses", <section slug>]
contentAvailable: false
```

The task section is useful for filtering, but it is not a user solve signal.

---

## 26. Persistence and deletion flows

### 26.1 Upsert identity rules

Provider records are idempotent under these keys:

| Record                | Identity                                         |
| --------------------- | ------------------------------------------------ |
| Catalog problem       | `(provider, externalId)`                         |
| Contest               | `(provider, externalId)`                         |
| Profile snapshot      | append-only snapshot for account/fetch time      |
| Submission            | `(providerAccountId, providerEventId)`           |
| Solved observation    | `(providerAccountId, externalId)`                |
| Rating change         | `(providerAccountId, eventId)`                   |
| Contest participation | `(providerAccountId, contestId)`                 |
| Sync job              | `idempotencyKey`                                 |
| Manual problem action | learner/action identity rules in `ProblemAction` |

An update should enrich missing tags/topics and timestamps without replacing a
newer trustworthy value with an empty or null value.

### 26.2 Handle changes

Changing a handle creates a separate identity boundary. Existing observations
remain attached to the old provider account and are not merged with the new
handle. The active account used by profile and sync services points to the new
identity.

### 26.3 Disconnect

Disconnect disables future synchronization and marks the account disconnected.
The current product policy retains provider history until explicit deletion so a
learner can reconnect without silently losing historical analytics.

### 26.4 Provider-history deletion

`DELETE /api/provider-accounts/:provider/history` removes the learner's
provider-specific profile snapshots, submissions, solved observations, rating
changes, contest participation, provider-generated actions/evidence, sync jobs,
and sync state. It does not delete unrelated manual progress for other
providers.

### 26.5 Full learner deletion

`DELETE /api/me/data` cascades through learner profile, provider accounts,
provider data, actions, recommendations, bookmarks, progress, memory evidence,
AI audits permitted by the service, and deletion status records. External
provider accounts themselves are not deleted; only AlgoMemtor's copies and
references are removed.

---

## 27. State machines and invariants

### 27.1 Provider capability state

```text
supported -> refreshing -> fresh
                      \-> partial
                      \-> stale
                      \-> unavailable
                      \-> disabled
```

The transition is capability-specific. For example, CodeChef activity can be
disabled while its catalog remains fresh.

### 27.2 Account activity state

```text
not_enabled -> consented -> queued -> running -> succeeded
                                      \-> partial
                                      \-> retry_wait
                                      \-> failed/stale
```

Revoking consent is terminal for the current activity run: a late response must
not restore the account to enabled or reinsert deleted provider evidence.

### 27.3 Learner status reduction

The current status for a problem is derived from the learner's latest relevant
manual/status action. Historical actions remain append-only. Provider evidence
and manual status are stored separately so a learner can correct a label without
destroying the external observation.

### 27.4 Invariants

- A response with `provider: cses` cannot enter a linkable-account route.
- A canonical URL must match the provider and validated external identifier.
- An AI-selected candidate must exist in the candidate set originally sent by
  Express.
- A provider aggregate count cannot create a solved observation.
- Outbound navigation cannot set problem status.
- A stale refresh cannot erase the last successful record.
- A missing tag list is different from an empty tag list returned by a provider.
- Combined solved total is a sum of provider totals, not a sum of incomplete
  concrete observations.
- Deletion is owner-scoped and cannot affect another learner's data.

---

## 28. How to extend the project

### 28.1 Add a new catalog provider

1. Add the provider key only if it is a real product requirement.
2. Decide whether it is linkable or catalog-only.
3. Add raw DTO schemas inside `apps/core-api/src/integrations/<provider>`.
4. Implement `ProblemProvider` methods and capability statuses.
5. Add a canonical URL builder with host and identifier validation.
6. Register a request gate and provider configuration.
7. Add the provider to server/app composition.
8. Update `ProviderKeySchema`, frontend labels, filters, analytics records, and
   mocks atomically.
9. Add migrations only for genuinely new persisted fields or constraints.
10. Add fixtures for valid, partial, blocked, malformed, rate-limited, and
    changed-schema responses.
11. Add a redacted live smoke test that is opt-in.
12. Update this document's capability matrix and limitation section.

### 28.2 Add a provider account activity source

The source must provide a concrete problem identifier and an evidence meaning.
Implement a `ProviderActivityDataFetcher` that returns normalized submissions,
solved observations, ratings, and participations. Use a bounded recent window
if all-time coverage is unavailable and set `complete: false`.

Never infer IDs from solved totals. Preserve null timestamps when the source has
no trustworthy time. Enrich tags in a separate validated detail request so a
detail failure does not discard an otherwise valid accepted observation.

### 28.3 Add a shared contract field

1. Add the field and validation to `packages/shared-contracts`.
2. Update every producer, repository serializer, API response, frontend type
   consumer, mock, and fixture.
3. Decide whether the field belongs in raw provider DTOs, normalized contracts,
   or persistence only.
4. Add backward-compatible handling for old database rows.
5. Add a migration if the field is persisted.
6. Run contract, provider, API, frontend, type-check, and build suites.

### 28.4 Add a frontend page

1. Define its API response contract first.
2. Add a central API function and TanStack Query hook.
3. Keep filters in URL parameters where they affect retrieval.
4. Implement loading, empty, success, partial/stale, and error states.
5. Reuse existing layout, provider labels, links, and notification patterns.
6. Add responsive and keyboard-accessible markup.
7. Add MSW handlers and page/component tests.

### 28.5 Add an AI feature

1. Keep deterministic filtering and fallback independent of the model.
2. Define a bounded Pydantic request/response contract in FastAPI.
3. Send derived metadata, not raw credentials, full statements, or arbitrary
   URLs.
4. Validate IDs and reasons in both FastAPI and Express.
5. Add timeout, unavailable, malformed-output, and audit-failure paths.
6. Make the feature kill-switchable and report fallback state honestly.

---

## 29. Planning framework for future work

Use this sequence for any future feature proposal.

### Step 1 — Define the user outcome

Write what the learner can do after the feature and what evidence the product
will show. Avoid describing an implementation before defining the outcome.

### Step 2 — Confirm the provider/data boundary

Classify the data as public metadata, public aggregate profile data, concrete
public activity, authenticated data, premium content, private data, or learner
data. Only the permitted classes should enter the current architecture.

### Step 3 — Define completeness

State whether the source is complete, bounded, partial, stale, or unknown. Add
the exact source limit, cursor, pagination rule, and failure behavior.

### Step 4 — Choose ownership and persistence

Decide whether the behavior belongs in React, Express, FastAPI, Prisma core,
Alembic AI, or an external provider. Do not add a second migration owner for an
existing table.

### Step 5 — Design the contract first

Define identifiers, canonical URLs, timestamps, tags, native values, normalized
values, provenance, completeness, and deletion semantics before implementation.

### Step 6 — Define failure and rollback behavior

Document timeout, rate-limit, block, schema-drift, stale-cache, retry, circuit
breaker, and partial-result behavior. Every external feature needs a kill
switch or a safe disable path.

### Step 7 — Implement the smallest vertical slice

Prefer one provider/source, one route, one persistence path, one UI state, and
one acceptance test before broadening coverage.

### Step 8 — Verify in layers

Run contract tests, adapter fixtures, repository tests, API tests, frontend tests,
type-check/build, and then opt-in live/browser checks. Label which layer each
piece of evidence proves.

### Step 9 — Update this document

Record the implemented files, API contract, migration, configuration, tests,
operational limits, and remaining gaps. This document is the planning baseline;
it should never claim live or production acceptance without corresponding
evidence.
