-- Browser connector pairing tokens. The secret is never stored; only its
-- SHA-256 hex digest.
CREATE TABLE "core"."connector_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "connector_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "connector_tokens_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "connector_tokens_token_hash_key" ON "core"."connector_tokens"("token_hash");
CREATE INDEX "connector_tokens_user_id_revoked_at_idx" ON "core"."connector_tokens"("user_id", "revoked_at");

ALTER TABLE "core"."connector_tokens" ADD CONSTRAINT "connector_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
