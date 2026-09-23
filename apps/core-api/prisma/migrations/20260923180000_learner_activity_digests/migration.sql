-- Synced-activity summary per learner, and the change notes that become
-- memory evidence.
CREATE TABLE "core"."learner_activity_digests" (
    "user_id" UUID NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "digest" JSONB NOT NULL,
    "source_hash" CHAR(64) NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learner_activity_digests_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "core"."learner_activity_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_activity_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learner_activity_changes_user_id_created_at_idx" ON "core"."learner_activity_changes"("user_id", "created_at");

ALTER TABLE "core"."learner_activity_digests" ADD CONSTRAINT "learner_activity_digests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "core"."learner_activity_changes" ADD CONSTRAINT "learner_activity_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
