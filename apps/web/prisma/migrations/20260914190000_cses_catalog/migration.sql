ALTER TABLE "core"."external_problem_cache"
  DROP CONSTRAINT IF EXISTS "external_problem_cache_provider_check",
  DROP CONSTRAINT IF EXISTS "external_problem_cache_canonical_url_check",
  ADD CONSTRAINT "external_problem_cache_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode', 'cses')),
  ADD CONSTRAINT "external_problem_cache_canonical_url_check"
    CHECK (canonical_url ~ '^https://(codeforces[.]com|www[.]codechef[.]com|leetcode[.]com|cses[.]fi)/[^[:space:]]+$');

ALTER TABLE "core"."bookmarks"
  DROP CONSTRAINT IF EXISTS "bookmarks_provider_check",
  ADD CONSTRAINT "bookmarks_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode', 'cses'));

ALTER TABLE "core"."recommendation_items"
  DROP CONSTRAINT IF EXISTS "recommendation_items_provider_check",
  ADD CONSTRAINT "recommendation_items_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode', 'cses'));

ALTER TABLE "core"."problem_actions"
  DROP CONSTRAINT IF EXISTS "problem_actions_provider_check",
  ADD CONSTRAINT "problem_actions_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode', 'cses'));

ALTER TABLE "core"."problem_reflections"
  DROP CONSTRAINT IF EXISTS "problem_reflections_provider_check",
  ADD CONSTRAINT "problem_reflections_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode', 'cses'));

ALTER TABLE "core"."problem_timer_sessions"
  DROP CONSTRAINT IF EXISTS "problem_timer_sessions_provider_check",
  ADD CONSTRAINT "problem_timer_sessions_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode', 'cses'));

ALTER TABLE "core"."outbox_jobs"
  DROP CONSTRAINT IF EXISTS "outbox_jobs_problem_identity_check",
  ADD CONSTRAINT "outbox_jobs_problem_identity_check"
    CHECK (
      (problem_provider IS NULL) = (problem_external_id IS NULL)
      AND (problem_provider IS NULL OR problem_provider IN ('codeforces', 'codechef', 'leetcode', 'cses'))
      AND (problem_external_id IS NULL OR (btrim(problem_external_id) <> '' AND problem_external_id !~ '[[:space:]]'))
    );
