CREATE SCHEMA IF NOT EXISTS core;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'learner_profiles_answers_object_check'
      AND conrelid = 'core.learner_profiles'::regclass
  ) THEN
    ALTER TABLE core.learner_profiles
      ADD CONSTRAINT learner_profiles_answers_object_check
      CHECK (jsonb_typeof(answers) = 'object');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS core.normalized_topics (
  id VARCHAR(96) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT normalized_topics_pkey PRIMARY KEY (id),
  CONSTRAINT normalized_topics_slug_key UNIQUE (slug),
  CONSTRAINT normalized_topics_id_check
    CHECK (btrim(id) <> '' AND id !~ '[[:space:]]'),
  CONSTRAINT normalized_topics_slug_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT normalized_topics_name_check
    CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS core.external_problem_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  title VARCHAR(512) NOT NULL,
  canonical_url VARCHAR(2048) NOT NULL,
  provider_difficulty JSONB,
  normalized_difficulty VARCHAR(16),
  provider_tags TEXT[] NOT NULL,
  normalized_topics TEXT[] NOT NULL,
  public_stats JSONB,
  availability VARCHAR(16) NOT NULL,
  fetched_at TIMESTAMPTZ(3) NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT external_problem_cache_pkey PRIMARY KEY (id),
  CONSTRAINT external_problem_cache_provider_external_id_key
    UNIQUE (provider, external_id),
  CONSTRAINT external_problem_cache_provider_check
    CHECK (provider IN ('codeforces')),
  CONSTRAINT external_problem_cache_external_id_check
    CHECK (
      btrim(external_id) <> ''
      AND external_id !~ '[[:space:]]'
    ),
  CONSTRAINT external_problem_cache_title_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT external_problem_cache_canonical_url_check
    CHECK (
      canonical_url ~ '^https://codeforces[.]com/[^[:space:]]+$'
    ),
  CONSTRAINT external_problem_cache_normalized_difficulty_check
    CHECK (
      normalized_difficulty IS NULL
      OR normalized_difficulty IN ('easy', 'medium', 'hard')
    ),
  CONSTRAINT external_problem_cache_provider_difficulty_check
    CHECK (
      provider_difficulty IS NULL
      OR (
        jsonb_typeof(provider_difficulty) = 'number'
        AND (provider_difficulty #>> '{}')::DOUBLE PRECISION >= 0
      )
      OR (
        jsonb_typeof(provider_difficulty) = 'string'
        AND btrim(provider_difficulty #>> '{}') <> ''
      )
    ),
  CONSTRAINT external_problem_cache_normalized_topics_check
    CHECK (cardinality(normalized_topics) > 0),
  CONSTRAINT external_problem_cache_availability_check
    CHECK (availability IN ('available', 'degraded', 'unavailable')),
  CONSTRAINT external_problem_cache_public_stats_check
    CHECK (
      public_stats IS NULL
      OR (
        jsonb_typeof(public_stats) = 'object'
        AND (
          NOT (public_stats ? 'solvedCount')
          OR (
            jsonb_typeof(public_stats -> 'solvedCount') = 'number'
            AND (public_stats ->> 'solvedCount')::BIGINT >= 0
          )
        )
      )
    ),
  CONSTRAINT external_problem_cache_expiry_check
    CHECK (fetched_at < expires_at)
);

CREATE TABLE IF NOT EXISTS core.bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT bookmarks_pkey PRIMARY KEY (id),
  CONSTRAINT bookmarks_user_id_provider_external_id_key
    UNIQUE (user_id, provider, external_id),
  CONSTRAINT bookmarks_provider_check
    CHECK (provider IN ('codeforces')),
  CONSTRAINT bookmarks_external_id_check
    CHECK (
      btrim(external_id) <> ''
      AND external_id !~ '[[:space:]]'
    ),
  CONSTRAINT bookmarks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS core.recommendation_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  request_criteria JSONB NOT NULL,
  ranking_mode VARCHAR(24) NOT NULL,
  ranking_version VARCHAR(64),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT recommendation_batches_pkey PRIMARY KEY (id),
  CONSTRAINT recommendation_batches_ranking_mode_check
    CHECK (ranking_mode IN ('ai', 'deterministic')),
  CONSTRAINT recommendation_batches_ranking_version_check
    CHECK (ranking_version IS NULL OR btrim(ranking_version) <> ''),
  CONSTRAINT recommendation_batches_request_criteria_check
    CHECK (jsonb_typeof(request_criteria) = 'object'),
  CONSTRAINT recommendation_batches_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS core.recommendation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  position INTEGER NOT NULL,
  score DOUBLE PRECISION,
  reason VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT recommendation_items_pkey PRIMARY KEY (id),
  CONSTRAINT recommendation_items_batch_provider_external_id_key
    UNIQUE (batch_id, provider, external_id),
  CONSTRAINT recommendation_items_batch_position_key
    UNIQUE (batch_id, position),
  CONSTRAINT recommendation_items_provider_check
    CHECK (provider IN ('codeforces')),
  CONSTRAINT recommendation_items_external_id_check
    CHECK (
      btrim(external_id) <> ''
      AND external_id !~ '[[:space:]]'
    ),
  CONSTRAINT recommendation_items_position_check
    CHECK (position > 0),
  CONSTRAINT recommendation_items_score_check
    CHECK (score IS NULL OR score >= 0),
  CONSTRAINT recommendation_items_reason_check
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 512),
  CONSTRAINT recommendation_items_batch_id_fkey
    FOREIGN KEY (batch_id) REFERENCES core.recommendation_batches(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS core.problem_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  learner_status VARCHAR(16),
  evidence_source VARCHAR(32),
  recommendation_batch_id UUID,
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT problem_actions_pkey PRIMARY KEY (id),
  CONSTRAINT problem_actions_provider_check
    CHECK (provider IN ('codeforces')),
  CONSTRAINT problem_actions_external_id_check
    CHECK (
      btrim(external_id) <> ''
      AND external_id !~ '[[:space:]]'
    ),
  CONSTRAINT problem_actions_action_type_check
    CHECK (
      action_type IN (
        'impression',
        'opened',
        'bookmarked',
        'unbookmarked',
        'dismissed',
        'status_changed'
      )
    ),
  CONSTRAINT problem_actions_learner_status_check
    CHECK (
      learner_status IS NULL
      OR learner_status IN ('unsolved', 'attempted', 'solved')
    ),
  CONSTRAINT problem_actions_evidence_source_check
    CHECK (
      evidence_source IS NULL
      OR evidence_source IN ('manual', 'provider_verified')
    ),
  CONSTRAINT problem_actions_status_evidence_check
    CHECK (
      (
        action_type = 'status_changed'
        AND learner_status IS NOT NULL
        AND evidence_source IS NOT NULL
      )
      OR (
        action_type <> 'status_changed'
        AND learner_status IS NULL
        AND evidence_source IS NULL
      )
    ),
  CONSTRAINT problem_actions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT problem_actions_recommendation_batch_id_fkey
    FOREIGN KEY (recommendation_batch_id)
    REFERENCES core.recommendation_batches(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS core.recommendation_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  recommendation_item_id UUID NOT NULL,
  usefulness VARCHAR(16),
  perceived_difficulty VARCHAR(24),
  notes TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT recommendation_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT recommendation_feedback_user_item_key
    UNIQUE (user_id, recommendation_item_id),
  CONSTRAINT recommendation_feedback_usefulness_check
    CHECK (
      usefulness IS NULL
      OR usefulness IN ('useful', 'not_useful')
    ),
  CONSTRAINT recommendation_feedback_perceived_difficulty_check
    CHECK (
      perceived_difficulty IS NULL
      OR perceived_difficulty IN ('too_easy', 'about_right', 'too_hard')
    ),
  CONSTRAINT recommendation_feedback_notes_check
    CHECK (
      notes IS NULL
      OR char_length(btrim(notes)) BETWEEN 1 AND 1000
    ),
  CONSTRAINT recommendation_feedback_dimension_check
    CHECK (usefulness IS NOT NULL OR perceived_difficulty IS NOT NULL),
  CONSTRAINT recommendation_feedback_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT recommendation_feedback_recommendation_item_id_fkey
    FOREIGN KEY (recommendation_item_id)
    REFERENCES core.recommendation_items(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS external_problem_cache_expires_at_idx
  ON core.external_problem_cache (expires_at);

CREATE INDEX IF NOT EXISTS external_problem_cache_provider_expires_at_idx
  ON core.external_problem_cache (provider, expires_at);

CREATE INDEX IF NOT EXISTS external_problem_cache_normalized_topics_idx
  ON core.external_problem_cache USING GIN (normalized_topics);

CREATE INDEX IF NOT EXISTS external_problem_cache_provider_tags_idx
  ON core.external_problem_cache USING GIN (provider_tags);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_created_at_idx
  ON core.bookmarks (user_id, created_at);

CREATE INDEX IF NOT EXISTS recommendation_batches_user_id_created_at_idx
  ON core.recommendation_batches (user_id, created_at);

CREATE INDEX IF NOT EXISTS recommendation_items_provider_external_id_idx
  ON core.recommendation_items (provider, external_id);

CREATE INDEX IF NOT EXISTS problem_actions_user_id_provider_external_id_occurred_at_idx
  ON core.problem_actions (user_id, provider, external_id, occurred_at);

CREATE INDEX IF NOT EXISTS problem_actions_user_id_action_type_occurred_at_idx
  ON core.problem_actions (user_id, action_type, occurred_at);

CREATE INDEX IF NOT EXISTS problem_actions_recommendation_batch_id_idx
  ON core.problem_actions (recommendation_batch_id);

CREATE INDEX IF NOT EXISTS recommendation_feedback_user_id_created_at_idx
  ON core.recommendation_feedback (user_id, created_at);

CREATE INDEX IF NOT EXISTS recommendation_feedback_recommendation_item_id_idx
  ON core.recommendation_feedback (recommendation_item_id);
