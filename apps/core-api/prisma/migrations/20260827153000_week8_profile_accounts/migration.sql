CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE core.users (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id)
);

CREATE TABLE core.learner_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  answers JSONB NOT NULL,
  onboarding_completed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT learner_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT learner_profiles_user_id_key UNIQUE (user_id),
  CONSTRAINT learner_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE core.provider_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_handle VARCHAR(64) NOT NULL,
  consent_scope VARCHAR(64) NOT NULL,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'not_verified',
  activity_access VARCHAR(32) NOT NULL DEFAULT 'not_enabled',
  public_stats_consent_at TIMESTAMPTZ(3),
  solved_count INTEGER,
  stats_complete BOOLEAN,
  stats_source VARCHAR(64),
  stats_fetched_at TIMESTAMPTZ(3),
  stats_attempted_at TIMESTAMPTZ(3),
  stats_error_code VARCHAR(64),
  stats_error_retryable BOOLEAN,
  linked_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT provider_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT provider_accounts_user_id_provider_key UNIQUE (user_id, provider),
  CONSTRAINT provider_accounts_provider_check
    CHECK (provider IN ('codeforces', 'codechef', 'leetcode')),
  CONSTRAINT provider_accounts_handle_check
    CHECK (
      external_handle ~ '^[A-Za-z0-9_.-]+$'
      AND external_handle ~ '[A-Za-z0-9]'
    ),
  CONSTRAINT provider_accounts_consent_scope_check
    CHECK (consent_scope = 'store_public_profile_reference'),
  CONSTRAINT provider_accounts_verification_status_check
    CHECK (verification_status = 'not_verified'),
  CONSTRAINT provider_accounts_activity_access_check
    CHECK (activity_access IN ('not_enabled', 'public_solved_count')),
  CONSTRAINT provider_accounts_solved_count_check
    CHECK (solved_count IS NULL OR solved_count >= 0),
  CONSTRAINT provider_accounts_stats_source_check
    CHECK (
      stats_source IS NULL
      OR stats_source IN (
        'codeforces_api',
        'codechef_public_profile_html',
        'leetcode_website_graphql'
      )
    ),
  CONSTRAINT provider_accounts_stats_error_code_check
    CHECK (
      stats_error_code IS NULL
      OR stats_error_code IN (
        'PROVIDER_ACCOUNT_NOT_FOUND',
        'PROVIDER_TIMEOUT',
        'PROVIDER_RATE_LIMITED',
        'PROVIDER_UNAVAILABLE',
        'PROVIDER_INVALID_RESPONSE'
      )
    ),
  CONSTRAINT provider_accounts_stats_success_check
    CHECK (
      (
        solved_count IS NULL
        AND stats_complete IS NULL
        AND stats_source IS NULL
        AND stats_fetched_at IS NULL
      )
      OR (
        solved_count IS NOT NULL
        AND stats_complete IS NOT NULL
        AND stats_source IS NOT NULL
        AND stats_fetched_at IS NOT NULL
      )
    ),
  CONSTRAINT provider_accounts_stats_error_check
    CHECK (
      (stats_error_code IS NULL AND stats_error_retryable IS NULL)
      OR (
        stats_error_code IS NOT NULL
        AND stats_error_retryable IS NOT NULL
        AND stats_attempted_at IS NOT NULL
      )
    ),
  CONSTRAINT provider_accounts_stats_consent_check
    CHECK (
      (
        activity_access = 'not_enabled'
        AND public_stats_consent_at IS NULL
        AND solved_count IS NULL
        AND stats_attempted_at IS NULL
        AND stats_error_code IS NULL
      )
      OR (
        activity_access = 'public_solved_count'
        AND public_stats_consent_at IS NOT NULL
        AND stats_attempted_at IS NOT NULL
      )
    ),
  CONSTRAINT provider_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
