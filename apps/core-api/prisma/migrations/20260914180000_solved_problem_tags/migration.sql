ALTER TABLE "core"."provider_solved_observations"
  ADD COLUMN "provider_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "normalized_topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
