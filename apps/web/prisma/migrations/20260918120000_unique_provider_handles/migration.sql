CREATE UNIQUE INDEX "provider_accounts_provider_handle_key"
ON "core"."provider_accounts" ("provider", "external_handle")
WHERE "sync_enabled" = true;
