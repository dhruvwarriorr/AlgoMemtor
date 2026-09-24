-- Learner-written recommendation instructions and the directives parsed from
-- them. Soft-removed rows stop steering recommendations.
CREATE TABLE "core"."recommendation_steering" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "directives" JSONB NOT NULL,
    "applied" JSONB NOT NULL,
    "memory_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "recommendation_steering_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recommendation_steering_text_check" CHECK (char_length(btrim("text")) > 0)
);

CREATE INDEX "recommendation_steering_user_id_removed_at_created_at_idx" ON "core"."recommendation_steering"("user_id", "removed_at", "created_at");

ALTER TABLE "core"."recommendation_steering" ADD CONSTRAINT "recommendation_steering_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
