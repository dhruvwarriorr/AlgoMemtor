-- Week 8 allowed only 'not_verified'; handle ownership verification adds
-- 'verified'.
ALTER TABLE "core"."provider_accounts"
    DROP CONSTRAINT "provider_accounts_verification_status_check";

ALTER TABLE "core"."provider_accounts"
    ADD CONSTRAINT "provider_accounts_verification_status_check"
    CHECK ("verification_status" IN ('not_verified', 'verified'));
