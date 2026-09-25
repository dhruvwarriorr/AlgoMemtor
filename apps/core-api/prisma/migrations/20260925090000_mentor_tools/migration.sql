-- Mentor tools: Doubt Helper sessions, cached AI reports, upsolve skip
-- state, and spaced revision items. Learner source code, compiler output and
-- pasted problem statements are never stored in these tables.

-- CreateTable
CREATE TABLE "core"."problem_help_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "platform" VARCHAR(32) NOT NULL,
    "provider" VARCHAR(32),
    "external_id" VARCHAR(128),
    "problem_title" VARCHAR(200) NOT NULL,
    "canonical_url" VARCHAR(2048),
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" VARCHAR(64) NOT NULL,
    "doubt_type" VARCHAR(32) NOT NULL,
    "attempt_summary" VARCHAR(1000) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "stage" VARCHAR(32) NOT NULL,
    "hint_level" INTEGER NOT NULL DEFAULT 0,
    "bug_category" VARCHAR(32),
    "version" INTEGER NOT NULL DEFAULT 1,
    "solution_revealed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "problem_help_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."problem_help_turns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "hint_level" INTEGER,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_help_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."mentor_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "report_key" VARCHAR(256) NOT NULL,
    "source_hash" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."upsolve_item_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "upsolve_item_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."revision_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "title" VARCHAR(512) NOT NULL,
    "canonical_url" VARCHAR(2048) NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" VARCHAR(16) NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "last_reviewed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problem_help_sessions_user_id_updated_at_idx" ON "core"."problem_help_sessions"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "problem_help_sessions_user_id_provider_external_id_idx" ON "core"."problem_help_sessions"("user_id", "provider", "external_id");

-- CreateIndex
CREATE INDEX "problem_help_turns_session_id_created_at_idx" ON "core"."problem_help_turns"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "mentor_reports_user_id_kind_generated_at_idx" ON "core"."mentor_reports"("user_id", "kind", "generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_reports_user_id_kind_report_key_key" ON "core"."mentor_reports"("user_id", "kind", "report_key");

-- CreateIndex
CREATE UNIQUE INDEX "upsolve_item_states_user_id_provider_external_id_key" ON "core"."upsolve_item_states"("user_id", "provider", "external_id");

-- CreateIndex
CREATE INDEX "revision_items_user_id_completed_at_due_at_idx" ON "core"."revision_items"("user_id", "completed_at", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "revision_items_user_id_provider_external_id_key" ON "core"."revision_items"("user_id", "provider", "external_id");

-- AddForeignKey
ALTER TABLE "core"."problem_help_sessions" ADD CONSTRAINT "problem_help_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."problem_help_turns" ADD CONSTRAINT "problem_help_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "core"."problem_help_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."mentor_reports" ADD CONSTRAINT "mentor_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."upsolve_item_states" ADD CONSTRAINT "upsolve_item_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."revision_items" ADD CONSTRAINT "revision_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hint levels stay within the five-step ladder.
ALTER TABLE "core"."problem_help_sessions" ADD CONSTRAINT "problem_help_sessions_hint_level_check" CHECK ("hint_level" BETWEEN 0 AND 5);
