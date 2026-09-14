ALTER TABLE "core"."provider_accounts"
  ADD COLUMN "activity_consent_at" TIMESTAMPTZ(3),
  ADD COLUMN "activity_sync_status" VARCHAR(16) NOT NULL DEFAULT 'not_enabled',
  ADD COLUMN "activity_last_attempted_at" TIMESTAMPTZ(3),
  ADD COLUMN "activity_last_succeeded_at" TIMESTAMPTZ(3),
  ADD COLUMN "activity_accepted_problem_count" INTEGER,
  ADD COLUMN "activity_complete" BOOLEAN,
  ADD COLUMN "activity_error_code" VARCHAR(64),
  ADD COLUMN "activity_retry_after" TIMESTAMPTZ(3);

CREATE TABLE "core"."provider_verified_activity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider_account_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "external_id" VARCHAR(128) NOT NULL,
  "provider_event_id" VARCHAR(96) NOT NULL,
  "provider_occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "first_observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_observed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "progress_action_id" UUID,

  CONSTRAINT "provider_verified_activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_verified_activity_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_verified_activity_provider_account_id_fkey"
    FOREIGN KEY ("provider_account_id") REFERENCES "core"."provider_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "provider_verified_activity_progress_action_id_fkey"
    FOREIGN KEY ("progress_action_id") REFERENCES "core"."problem_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "provider_verified_activity_user_provider_external_key"
  ON "core"."provider_verified_activity"("user_id", "provider", "external_id");
CREATE UNIQUE INDEX "provider_verified_activity_account_event_key"
  ON "core"."provider_verified_activity"("provider_account_id", "provider_event_id");
CREATE UNIQUE INDEX "provider_verified_activity_progress_action_key"
  ON "core"."provider_verified_activity"("progress_action_id");
CREATE INDEX "provider_verified_activity_user_occurred_idx"
  ON "core"."provider_verified_activity"("user_id", "provider_occurred_at");
