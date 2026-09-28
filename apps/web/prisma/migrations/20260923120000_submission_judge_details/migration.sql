-- Judge measurements reported by providers for each submission.
ALTER TABLE "core"."provider_submissions"
    ADD COLUMN "runtime_ms" INTEGER,
    ADD COLUMN "memory_kb" INTEGER,
    ADD COLUMN "passed_test_count" INTEGER;

ALTER TABLE "core"."provider_submissions"
    ADD CONSTRAINT "provider_submissions_judge_details_check" CHECK (
        ("runtime_ms" IS NULL OR "runtime_ms" >= 0)
        AND ("memory_kb" IS NULL OR "memory_kb" >= 0)
        AND ("passed_test_count" IS NULL OR "passed_test_count" >= 0)
    );

-- When tag enrichment last looked up a solved problem, so problems a provider
-- publishes without tags are retried occasionally instead of on every sync.
ALTER TABLE "core"."provider_solved_observations"
    ADD COLUMN "tags_checked_at" TIMESTAMPTZ(3);
