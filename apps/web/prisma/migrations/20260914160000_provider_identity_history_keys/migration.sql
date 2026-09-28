-- Keep provider activity history isolated by linked identity. The original
-- release keyed these observations by learner/provider/problem, which could
-- overwrite an archived handle's record after a handle change.
DROP INDEX IF EXISTS "core"."provider_verified_activity_user_provider_external_key";
CREATE UNIQUE INDEX "provider_verified_activity_account_external_key"
  ON "core"."provider_verified_activity"("provider_account_id", "external_id");
CREATE INDEX "provider_verified_activity_user_provider_external_idx"
  ON "core"."provider_verified_activity"("user_id", "provider", "external_id");

DROP INDEX IF EXISTS "core"."provider_solved_observations_user_provider_external_key";
CREATE UNIQUE INDEX "provider_solved_observations_account_external_key"
  ON "core"."provider_solved_observations"("provider_account_id", "external_id");
CREATE INDEX "provider_solved_observations_user_provider_external_idx"
  ON "core"."provider_solved_observations"("user_id", "provider", "external_id");
