-- When the learner's browser connector last uploaded an account's data.
ALTER TABLE "core"."provider_accounts" ADD COLUMN "connector_synced_at" TIMESTAMPTZ(3);
