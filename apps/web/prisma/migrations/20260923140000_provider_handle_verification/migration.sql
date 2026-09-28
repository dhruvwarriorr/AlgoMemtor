-- Handle ownership verification: a short-lived code the learner places in a
-- public profile field, and when the handle was proven to be theirs.
ALTER TABLE "core"."provider_accounts"
    ADD COLUMN "verification_code" VARCHAR(16),
    ADD COLUMN "verification_expires_at" TIMESTAMPTZ(3),
    ADD COLUMN "verified_at" TIMESTAMPTZ(3);

ALTER TABLE "core"."provider_accounts"
    ADD CONSTRAINT "provider_accounts_verification_state_check" CHECK (
        ("verification_status" = 'not_verified' AND "verified_at" IS NULL)
        OR ("verification_status" = 'verified' AND "verified_at" IS NOT NULL
            AND "verification_code" IS NULL)
    );
