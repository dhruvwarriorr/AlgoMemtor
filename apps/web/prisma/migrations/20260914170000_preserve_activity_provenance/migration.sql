ALTER TABLE "core"."provider_rating_changes"
  ADD COLUMN "canonical_url" VARCHAR(2048) NOT NULL DEFAULT 'https://codeforces.com/contest/0',
  ADD COLUMN "completeness" VARCHAR(16) NOT NULL DEFAULT 'complete';

ALTER TABLE "core"."contest_participations"
  ADD COLUMN "canonical_url" VARCHAR(2048) NOT NULL DEFAULT 'https://codeforces.com/contest/0';

UPDATE "core"."provider_rating_changes"
SET "canonical_url" = CASE "provider"
  WHEN 'codeforces' THEN
    'https://codeforces.com/contest/' || COALESCE("contest_id", '0')
  WHEN 'codechef' THEN
    'https://www.codechef.com/contests/' || COALESCE("contest_id", 'unknown')
  WHEN 'leetcode' THEN 'https://leetcode.com/contest/'
  ELSE "source_url"
END;

UPDATE "core"."contest_participations"
SET "canonical_url" = CASE "provider"
  WHEN 'codeforces' THEN
    'https://codeforces.com/contest/' || COALESCE("contest_id", '0')
  WHEN 'codechef' THEN
    'https://www.codechef.com/contests/' || COALESCE("contest_id", 'unknown')
  WHEN 'leetcode' THEN 'https://leetcode.com/contest/'
  ELSE "source_url"
END;

ALTER TABLE "core"."provider_rating_changes"
  DROP CONSTRAINT IF EXISTS "provider_rating_changes_completeness_check",
  ADD CONSTRAINT "provider_rating_changes_completeness_check"
    CHECK ("completeness" IN ('complete', 'partial', 'unknown'));
