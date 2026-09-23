-- CSES accounts link through the browser connector, which also reports their
-- solved totals.
ALTER TABLE "core"."provider_accounts"
    DROP CONSTRAINT "provider_accounts_provider_check";
ALTER TABLE "core"."provider_accounts"
    ADD CONSTRAINT "provider_accounts_provider_check"
    CHECK ("provider" IN ('codeforces', 'codechef', 'leetcode', 'cses'));

ALTER TABLE "core"."provider_accounts"
    DROP CONSTRAINT "provider_accounts_stats_source_check";
ALTER TABLE "core"."provider_accounts"
    ADD CONSTRAINT "provider_accounts_stats_source_check"
    CHECK ("stats_source" IS NULL OR "stats_source" IN (
        'codeforces_api',
        'codechef_public_profile_html',
        'leetcode_website_graphql',
        'browser_connector'
    ));
