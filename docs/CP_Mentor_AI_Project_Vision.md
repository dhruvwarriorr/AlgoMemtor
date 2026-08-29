# AlgoMemtor: Your Persistent AI Learning Navigator

## Project Vision — External Problem Discovery Edition

---

## 1. Executive Summary

AlgoMemtor is an AI-guided learning layer for people practicing algorithms,
competitive programming, and coding interviews. It does not try to become
another problem-hosting and judging platform. Instead, it understands the
learner, discovers appropriate problems from supported external platforms, and
creates a personalized path through the best existing practice ecosystems.

The learner sees attributed problem metadata and an explanation of why each
problem was recommended. Selecting a problem redirects them to the original
platform, where they read the full statement, write code, submit, and receive the
authoritative verdict.

AlgoMemtor remembers goals, preferences, explicit feedback, manually reported
progress, and provider-verified activity when an official API permits it. This
memory makes later recommendations more relevant while remaining inspectable and
correctable by the user.

---

## 2. Why This Product Should Exist

Practice platforms already provide large libraries, editors, compilers, judges,
contests, and communities. The unresolved learner problem is deciding what to do
next and understanding why.

Learners commonly experience:

- choice overload across multiple problem libraries;
- practice that is too easy, too difficult, or poorly sequenced;
- weak revision habits;
- little connection between recent mistakes and the next problem;
- disconnected progress across platforms; and
- generic AI advice that forgets previous sessions.

AlgoMemtor focuses on this coordination problem rather than copying content or
duplicating judges.

---

## 3. Core Product Boundary

### AlgoMemtor owns

- onboarding and learner goals;
- provider preferences;
- external-problem discovery through permitted APIs;
- metadata normalization;
- AI ranking and recommendation explanations;
- learning plans and revision schedules;
- bookmarks, dismissals, outbound opens, and three-value question status;
- linked-provider evidence where supported; and
- persistent, user-controlled learner memory.

### External platforms own

- complete problem statements and examples;
- constraints and editorials;
- editors, compilers, and judges;
- test cases and verdicts;
- contest rules and platform accounts; and
- authoritative submission history.

### AlgoMemtor will not

- copy or store complete problem content;
- embed a coding editor;
- execute user code;
- invent external URLs with an LLM; or
- claim that opening a link proves completion.

---

## 4. Target Audience

### Complete beginners

They need a small, confidence-building sequence of problems, clear topic labels,
and explanations that avoid overwhelming them.

### Intermediate interview learners

They need balanced topic coverage, revision, time-aware recommendations, and a
clear record of what they intended to practise.

### Competitive programmers

They need rating-aware recommendations, targeted weak-topic work, contest
upsolving plans, and cross-platform coordination.

### Returning learners

They need the system to remember previous goals and create a realistic restart
plan rather than assuming continuous progress.

---

## 5. Core Experience

```text
Tell AlgoMemtor your goal
        |
        v
AlgoMemtor fetches permitted external metadata
        |
        v
AI ranks a validated candidate set
        |
        v
You receive problems with clear reasons
        |
        v
Open the problem on its source platform
        |
        v
Return, report progress, or sync supported activity
        |
        v
The next recommendation improves
```

The user should always know:

- which platform owns the problem;
- why it was selected;
- what skill it targets;
- how hard it is expected to be;
- whether progress is manual or provider-verified; and
- what AlgoMemtor recommends doing afterward.

---

## 6. Feature Vision

### Feature 1 — Intelligent onboarding

Onboarding captures:

- learning goal;
- current experience;
- preferred topics and weak topics;
- available time per week;
- preferred external platforms;
- approximate rating or difficulty comfort zone; and
- consent for any linked-provider activity.

The first recommendation should work without requiring a linked account.

### Feature 2 — Persistent learner memory

AlgoMemtor remembers only useful, explainable learning facts, such as:

- “The learner wants interview preparation in eight weeks.”
- “The learner prefers short weekday sessions.”
- “Binary search boundary conditions are repeatedly marked difficult.”
- “The learner dismissed three advanced graph problems as too hard.”
- “A linked provider verified recent success around rating 1100.”

Every memory should include evidence, confidence, and a user-visible correction
or deletion control.

### Feature 3 — Smart external problem recommendations

The recommendation engine selects from provider-supplied metadata using:

- weak topics;
- target difficulty progression;
- time available;
- recent repetition and revision needs;
- provider preferences;
- dismissed or previously recommended problems;
- manual completion evidence; and
- verified activity where available.

Each recommendation contains a short explanation and a canonical outbound link.
The AI ranks candidates that backend adapters have already fetched and validated;
it does not browse the open web by itself.

### Feature 4 — Adaptive learning roadmap

The roadmap is a living sequence of skills and external practice tasks. It can
adapt when:

- the learner changes goals;
- a recommendation is marked too easy or too hard;
- verified activity shows progress;
- the learner pauses for a long time; or
- a provider becomes unavailable.

The roadmap links to provider-owned problems and approved learning resources. It
does not reproduce their content.

### Feature 5 — Recommendation conversations

The learner can request a different direction conversationally:

- “Something easier.”
- “No dynamic programming today.”
- “Give me a Codeforces problem around 1200.”
- “I only have twenty minutes.”

The conversation becomes structured filters and ranking preferences. The final
problem must still come from a validated provider response.

### Feature 6 — Progress and evidence

Every question uses one of three statuses:

1. `unsolved`;
2. `attempted`; or
3. `solved`.

Recommendations, outbound opens, dismissals, and manual or provider evidence are
tracked separately. An outbound open never changes a question's status.

### Feature 7 — Cross-platform practice planning

As integrations mature, AlgoMemtor can balance problems across supported
platforms.

### Feature 8 — Contest preparation and upsolving

AlgoMemtor can recommend existing external contests or problem groups based on
topic, rating, and available time. It can create an upsolve checklist from
permitted metadata and linked-account evidence.

AlgoMemtor does not recreate a provider's contest environment. Timers,
submissions, penalties, and judging stay on the originating platform.

### Feature 9 — Learning reflection

After external practice, AlgoMemtor can ask the learner to record:

- whether they completed the problem;
- perceived difficulty;
- time spent;
- which idea was difficult; and
- whether they want a similar or contrasting problem.

These reflections are user-authored learning data. They are more useful for
personalization than pretending an outbound click was a solve.

### Feature 10 — Optional provider activity sync

Where an official API and platform terms permit it, a user can link a public
handle or authorize access. AlgoMemtor may then verify supported activity.

The UI must show:

- which provider is linked;
- what data is read;
- when it was last synchronized;
- whether evidence is verified; and
- how to disconnect and delete imported learner activity.

No provider integration is assumed until this review is complete.

### Feature 11 — Curated free resources

Roadmaps may link to official documentation, videos, articles, and editorials.
AlgoMemtor stores the resource title, attribution, URL, and learner notes, not a
copied version of the resource.

### Feature 12 — Social accountability

Future groups may share goals, streaks, and recommendation lists. Social features
must not expose private learner memories or imply verified solves when progress
was manually reported.

### Feature 13 — Mock interview planning

AlgoMemtor can assemble an interview-practice plan using external problem links,
time boxes, and reflection prompts. The external platform remains responsible for
the problem and any code execution.

### Feature 14 — Achievements

Achievements should reward meaningful, labelled behavior:

- consistent practice;
- verified completions;
- honest reflections;
- revision of weak topics; and
- sustained roadmap progress.

An outbound click alone should not unlock a solving achievement.

---

## 7. AI Philosophy

AI is useful for interpreting goals, ranking candidates, explaining choices,
finding patterns, and adapting plans. Deterministic software remains responsible
for provider access, schema validation, URL safety, permissions, and evidence
labels.

The product should work in degraded mode:

- provider available, AI unavailable: show deterministically filtered problems;
- one provider unavailable: show other providers or a clearly labelled cache;
- all providers unavailable: show saved bookmarks and a retry state;
- linked activity unavailable: retain manual progress without calling it verified.

---

## 8. Provider Philosophy

Codeforces is a strong initial reference because it publishes an official API
with problem identifiers, names, ratings, tags, and statistics. That metadata is
enough to build attributed discovery cards and canonical links without copying
statements.

Other platforms may be desirable, including LeetCode, CodeChef, AtCoder, and
CSES, but desire is not an integration contract. Each provider requires a current
review of official API availability, terms, attribution, rate limits, caching,
and user-activity access. 

---

## 9. Business and Trust Principles

- Never hide the originating platform.
- Never imply a formal partnership without one.
- Never manufacture a completion signal.
- Let users inspect and delete personalization data.
- Keep recommendations explainable.
- Keep the ordinary filter-and-redirect experience useful without AI.

---

## 10. Future Vision

AlgoMemtor can become the learner's coordination layer across the fragmented
algorithm-learning ecosystem: one place to decide what to practise, understand
why, reflect afterward, and build a long-term path.

Its advantage is not owning the questions or compiler. Its advantage is knowing
the learner well enough to guide them toward the right external challenge at the
right time.

## Official reference

- [Codeforces API](https://codeforces.com/apiHelp)
- [Codeforces problem metadata object](https://codeforces.com/apiHelp/objects#Problem)
