ALTER TABLE "core"."provider_accounts"
  ADD COLUMN "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "disconnected_at" TIMESTAMPTZ(3);

ALTER TABLE "core"."provider_accounts"
  DROP CONSTRAINT IF EXISTS "provider_accounts_user_id_provider_key";
CREATE UNIQUE INDEX IF NOT EXISTS "provider_accounts_user_provider_handle_key"
  ON "core"."provider_accounts"("user_id", "provider", "external_handle");
CREATE UNIQUE INDEX IF NOT EXISTS "provider_accounts_active_provider_key"
  ON "core"."provider_accounts"("user_id", "provider")
  WHERE "sync_enabled" = true;

-- Linking records long-lived consent before the first statistics attempt. The
-- Week 8 check only allowed consent after a fetch, so replace it with the
-- three valid states: no consent, consent without a fetch, or a fetched
-- public-statistics result/error.
ALTER TABLE "core"."provider_accounts"
  DROP CONSTRAINT IF EXISTS "provider_accounts_stats_error_code_check",
  ADD CONSTRAINT "provider_accounts_stats_error_code_check"
    CHECK (
      stats_error_code IS NULL
      OR stats_error_code IN (
        'PROVIDER_ACCOUNT_NOT_FOUND',
        'PROVIDER_TIMEOUT',
        'PROVIDER_RATE_LIMITED',
        'PROVIDER_BLOCKED',
        'PROVIDER_UNAVAILABLE',
        'PROVIDER_INVALID_RESPONSE'
      )
    ),
  DROP CONSTRAINT IF EXISTS "provider_accounts_stats_consent_check",
  ADD CONSTRAINT "provider_accounts_stats_consent_check"
    CHECK (
      (
        activity_access = 'not_enabled'
        AND solved_count IS NULL
        AND stats_complete IS NULL
        AND stats_source IS NULL
        AND stats_fetched_at IS NULL
        AND stats_attempted_at IS NULL
        AND stats_error_code IS NULL
        AND stats_error_retryable IS NULL
      )
      OR (
        activity_access = 'public_solved_count'
        AND public_stats_consent_at IS NOT NULL
        AND stats_attempted_at IS NOT NULL
      )
    );

-- The Week 9/10 tables were Codeforces-only.  The unified release keeps their
-- ownership and safety checks, but widens the provider allowlist atomically so
-- existing bookmarks, actions, recommendations, reflections, and timers can
-- refer to any linked provider.
ALTER TABLE "core"."external_problem_cache"
  DROP CONSTRAINT IF EXISTS "external_problem_cache_provider_check",
  DROP CONSTRAINT IF EXISTS "external_problem_cache_canonical_url_check",
  ADD CONSTRAINT "external_problem_cache_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode')),
  ADD CONSTRAINT "external_problem_cache_canonical_url_check"
    CHECK (canonical_url ~ '^https://(codeforces[.]com|www[.]codechef[.]com|leetcode[.]com)/[^[:space:]]+$');

ALTER TABLE "core"."bookmarks"
  DROP CONSTRAINT IF EXISTS "bookmarks_provider_check",
  ADD CONSTRAINT "bookmarks_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode'));

ALTER TABLE "core"."recommendation_items"
  DROP CONSTRAINT IF EXISTS "recommendation_items_provider_check",
  ADD CONSTRAINT "recommendation_items_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode'));

ALTER TABLE "core"."problem_actions"
  DROP CONSTRAINT IF EXISTS "problem_actions_provider_check",
  ADD CONSTRAINT "problem_actions_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode'));

ALTER TABLE "core"."problem_reflections"
  DROP CONSTRAINT IF EXISTS "problem_reflections_provider_check",
  ADD CONSTRAINT "problem_reflections_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode'));

ALTER TABLE "core"."problem_timer_sessions"
  DROP CONSTRAINT IF EXISTS "problem_timer_sessions_provider_check",
  ADD CONSTRAINT "problem_timer_sessions_provider_check"
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode'));

ALTER TABLE "core"."external_problem_cache"
  ADD COLUMN "acceptance_rate" DOUBLE PRECISION,
  ADD COLUMN "is_paid_only" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "content_available" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "extraction_strategy" VARCHAR(32) NOT NULL DEFAULT 'official_json',
  ADD COLUMN "source_url" VARCHAR(2048) NOT NULL DEFAULT 'https://codeforces.com/api/problemset.problems',
  ADD COLUMN "schema_version" VARCHAR(64) NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN "completeness" VARCHAR(16) NOT NULL DEFAULT 'complete',
  ADD COLUMN "stale" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "core"."problem_content_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(32) NOT NULL,
  "external_id" VARCHAR(128) NOT NULL,
  "title" VARCHAR(512) NOT NULL,
  "canonical_url" VARCHAR(2048) NOT NULL,
  "statement_html" TEXT,
  "statement_text" TEXT,
  "constraints" JSONB,
  "examples" JSONB,
  "hints" JSONB,
  "public_solution_html" TEXT,
  "is_paid_only" BOOLEAN NOT NULL DEFAULT false,
  "content_available" BOOLEAN NOT NULL DEFAULT false,
  "extraction_strategy" VARCHAR(32) NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "completeness" VARCHAR(16) NOT NULL,
  "availability" VARCHAR(16) NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "problem_content_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "problem_content_cache_provider_external_key"
  ON "core"."problem_content_cache"("provider", "external_id");
CREATE INDEX "problem_content_cache_expires_idx"
  ON "core"."problem_content_cache"("expires_at");
CREATE INDEX "problem_content_cache_provider_expires_idx"
  ON "core"."problem_content_cache"("provider", "expires_at");

CREATE TABLE "core"."external_contests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(32) NOT NULL,
  "external_id" VARCHAR(128) NOT NULL,
  "name" VARCHAR(512) NOT NULL,
  "canonical_url" VARCHAR(2048) NOT NULL,
  "phase" VARCHAR(32),
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "duration_seconds" INTEGER,
  "is_rated" BOOLEAN,
  "status" VARCHAR(16) NOT NULL,
  "extraction_strategy" VARCHAR(32) NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "completeness" VARCHAR(16) NOT NULL,
  "availability" VARCHAR(16) NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_contests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_contests_provider_external_key"
  ON "core"."external_contests"("provider", "external_id");
CREATE INDEX "external_contests_provider_starts_idx"
  ON "core"."external_contests"("provider", "starts_at");
CREATE INDEX "external_contests_status_starts_idx"
  ON "core"."external_contests"("status", "starts_at");

CREATE TABLE "core"."provider_profile_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider_account_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "external_handle" VARCHAR(128) NOT NULL,
  "display_name" VARCHAR(256),
  "profile_url" VARCHAR(2048) NOT NULL,
  "avatar_url" VARCHAR(2048),
  "rank" VARCHAR(128),
  "global_rank" INTEGER,
  "rating" DOUBLE PRECISION,
  "solved_count" INTEGER,
  "acceptance_rate" DOUBLE PRECISION,
  "language_counts" JSONB NOT NULL,
  "topic_counts" JSONB NOT NULL,
  "badges" JSONB NOT NULL,
  "calendar" JSONB NOT NULL,
  "completeness" VARCHAR(16) NOT NULL,
  "extraction_strategy" VARCHAR(32) NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_profile_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_profile_snapshots_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_profile_snapshots_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "provider_profile_snapshots_user_provider_fetched_idx"
  ON "core"."provider_profile_snapshots"("user_id", "provider", "fetched_at");
CREATE INDEX "provider_profile_snapshots_account_fetched_idx"
  ON "core"."provider_profile_snapshots"("provider_account_id", "fetched_at");

CREATE TABLE "core"."provider_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider_account_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "external_id" VARCHAR(128) NOT NULL,
  "provider_event_id" VARCHAR(128) NOT NULL,
  "problem_title" VARCHAR(512),
  "canonical_url" VARCHAR(2048) NOT NULL,
  "verdict" VARCHAR(64) NOT NULL,
  "language" VARCHAR(128),
  "occurred_at" TIMESTAMPTZ(3),
  "is_accepted" BOOLEAN NOT NULL,
  "completeness" VARCHAR(16) NOT NULL,
  "extraction_strategy" VARCHAR(32) NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_submissions_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_submissions_account_event_key"
  ON "core"."provider_submissions"("provider_account_id", "provider_event_id");
CREATE INDEX "provider_submissions_user_provider_occurred_idx"
  ON "core"."provider_submissions"("user_id", "provider", "occurred_at");
CREATE INDEX "provider_submissions_account_occurred_idx"
  ON "core"."provider_submissions"("provider_account_id", "occurred_at");

CREATE TABLE "core"."provider_solved_observations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider_account_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "external_id" VARCHAR(128) NOT NULL,
  "provider_event_id" VARCHAR(128),
  "canonical_url" VARCHAR(2048) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3),
  "first_observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completeness" VARCHAR(16) NOT NULL,
  "extraction_strategy" VARCHAR(32) NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  CONSTRAINT "provider_solved_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_solved_observations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_solved_observations_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_solved_observations_user_provider_external_key"
  ON "core"."provider_solved_observations"("user_id", "provider", "external_id");
CREATE UNIQUE INDEX "provider_solved_observations_account_event_key"
  ON "core"."provider_solved_observations"("provider_account_id", "provider_event_id");
CREATE INDEX "provider_solved_observations_user_occurred_idx"
  ON "core"."provider_solved_observations"("user_id", "occurred_at");

CREATE TABLE "core"."provider_rating_changes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider_account_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "event_id" VARCHAR(128) NOT NULL,
  "contest_id" VARCHAR(128),
  "contest_name" VARCHAR(512),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "old_rating" DOUBLE PRECISION NOT NULL,
  "new_rating" DOUBLE PRECISION NOT NULL,
  "delta" DOUBLE PRECISION NOT NULL,
  "provider_percentile" DOUBLE PRECISION,
  "extraction_strategy" VARCHAR(32) NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  CONSTRAINT "provider_rating_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_rating_changes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_rating_changes_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_rating_changes_account_event_key"
  ON "core"."provider_rating_changes"("provider_account_id", "event_id");
CREATE INDEX "provider_rating_changes_user_provider_occurred_idx"
  ON "core"."provider_rating_changes"("user_id", "provider", "occurred_at");

CREATE TABLE "core"."contest_participations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider_account_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "contest_id" VARCHAR(128) NOT NULL,
  "contest_name" VARCHAR(512),
  "rank" INTEGER,
  "score" DOUBLE PRECISION,
  "rating_change" DOUBLE PRECISION,
  "old_rating" DOUBLE PRECISION,
  "new_rating" DOUBLE PRECISION,
  "attended_at" TIMESTAMPTZ(3),
  "extraction_strategy" VARCHAR(32) NOT NULL,
  "source_url" VARCHAR(2048) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "completeness" VARCHAR(16) NOT NULL,
  CONSTRAINT "contest_participations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contest_participations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contest_participations_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "contest_participations_account_contest_key"
  ON "core"."contest_participations"("provider_account_id", "contest_id");
CREATE INDEX "contest_participations_user_provider_attended_idx"
  ON "core"."contest_participations"("user_id", "provider", "attended_at");

CREATE TABLE "core"."provider_sync_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope_key" VARCHAR(160) NOT NULL,
  "user_id" UUID,
  "provider_account_id" UUID,
  "provider" VARCHAR(32) NOT NULL,
  "capability" VARCHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "cursor" TEXT,
  "last_started_at" TIMESTAMPTZ(3),
  "last_succeeded_at" TIMESTAMPTZ(3),
  "next_run_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(64),
  "completeness" VARCHAR(16) NOT NULL,
  "stale" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_sync_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_sync_states_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_sync_states_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_sync_states_scope_provider_capability_key"
  ON "core"."provider_sync_states"("scope_key", "provider", "capability");
CREATE INDEX "provider_sync_states_provider_capability_next_idx"
  ON "core"."provider_sync_states"("provider", "capability", "next_run_at");
CREATE INDEX "provider_sync_states_user_provider_capability_idx"
  ON "core"."provider_sync_states"("user_id", "provider", "capability");

CREATE TABLE "core"."provider_sync_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "provider_account_id" UUID,
  "provider" VARCHAR(32) NOT NULL,
  "capability" VARCHAR(64) NOT NULL,
  "job_type" VARCHAR(64) NOT NULL,
  "cursor" TEXT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
  "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_owner" VARCHAR(128),
  "lease_expires_at" TIMESTAMPTZ(3),
  "idempotency_key" VARCHAR(192) NOT NULL,
  "last_error_code" VARCHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_sync_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_sync_jobs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_sync_jobs_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_sync_jobs_idempotency_key_key"
  ON "core"."provider_sync_jobs"("idempotency_key");
CREATE INDEX "provider_sync_jobs_status_run_after_idx"
  ON "core"."provider_sync_jobs"("status", "run_after");
CREATE INDEX "provider_sync_jobs_provider_capability_status_idx"
  ON "core"."provider_sync_jobs"("provider", "capability", "status", "run_after");
CREATE INDEX "provider_sync_jobs_user_created_idx"
  ON "core"."provider_sync_jobs"("user_id", "created_at");

INSERT INTO "core"."provider_solved_observations" (
  "user_id", "provider_account_id", "provider", "external_id",
  "provider_event_id", "canonical_url", "occurred_at", "first_observed_at",
  "last_observed_at", "completeness", "extraction_strategy", "source_url",
  "schema_version"
)
SELECT
  activity."user_id",
  activity."provider_account_id",
  activity."provider",
  activity."external_id",
  activity."provider_event_id",
  CASE
    WHEN regexp_match(activity."external_id", '^([0-9]+)([A-Z][0-9]*)$') IS NOT NULL
      THEN 'https://codeforces.com/problemset/problem/' ||
        (regexp_match(activity."external_id", '^([0-9]+)([A-Z][0-9]*)$'))[1] || '/' ||
        (regexp_match(activity."external_id", '^([0-9]+)([A-Z][0-9]*)$'))[2]
    ELSE 'https://codeforces.com/problemset'
  END,
  activity."provider_occurred_at",
  activity."first_observed_at",
  activity."last_observed_at",
  'partial',
  'official_json',
  'https://codeforces.com/api/user.status',
  'codeforces-activity-v1'
FROM "core"."provider_verified_activity" AS activity
ON CONFLICT ("user_id", "provider", "external_id") DO UPDATE SET
  "last_observed_at" = EXCLUDED."last_observed_at";
