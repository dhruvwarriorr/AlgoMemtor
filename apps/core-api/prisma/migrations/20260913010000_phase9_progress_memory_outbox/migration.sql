ALTER TABLE core.problem_actions
  ADD COLUMN IF NOT EXISTS recommendation_item_id UUID,
  ADD COLUMN IF NOT EXISTS source_context VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'problem_actions_recommendation_item_id_fkey'
      AND conrelid = 'core.problem_actions'::regclass
  ) THEN
    ALTER TABLE core.problem_actions
      ADD CONSTRAINT problem_actions_recommendation_item_id_fkey
      FOREIGN KEY (recommendation_item_id)
      REFERENCES core.recommendation_items(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS core.problem_reflections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  perceived_difficulty VARCHAR(16) NOT NULL,
  note VARCHAR(1000),
  status_action_id UUID,
  supersedes_reflection_id UUID,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT problem_reflections_pkey PRIMARY KEY (id),
  CONSTRAINT problem_reflections_provider_check
    CHECK (provider IN ('codeforces')),
  CONSTRAINT problem_reflections_external_id_check
    CHECK (btrim(external_id) <> '' AND external_id !~ '[[:space:]]'),
  CONSTRAINT problem_reflections_difficulty_check
    CHECK (perceived_difficulty IN ('easy', 'medium', 'hard')),
  CONSTRAINT problem_reflections_note_check
    CHECK (note IS NULL OR char_length(btrim(note)) <= 1000),
  CONSTRAINT problem_reflections_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT problem_reflections_status_action_id_fkey
    FOREIGN KEY (status_action_id) REFERENCES core.problem_actions(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT problem_reflections_supersedes_reflection_id_fkey
    FOREIGN KEY (supersedes_reflection_id) REFERENCES core.problem_reflections(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS core.problem_timer_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  state VARCHAR(16) NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_resumed_at TIMESTAMPTZ(3),
  paused_at TIMESTAMPTZ(3),
  completed_at TIMESTAMPTZ(3),
  requires_resolution BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT problem_timer_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT problem_timer_sessions_provider_check
    CHECK (provider IN ('codeforces')),
  CONSTRAINT problem_timer_sessions_external_id_check
    CHECK (btrim(external_id) <> '' AND external_id !~ '[[:space:]]'),
  CONSTRAINT problem_timer_sessions_state_check
    CHECK (state IN ('running', 'paused', 'completed', 'discarded', 'capped')),
  CONSTRAINT problem_timer_sessions_duration_check
    CHECK (duration_seconds >= 0 AND duration_seconds <= 14400),
  CONSTRAINT problem_timer_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS core.learner_ai_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL,
  policy_version VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT learner_ai_consents_pkey PRIMARY KEY (id),
  CONSTRAINT learner_ai_consents_policy_version_check
    CHECK (btrim(policy_version) <> ''),
  CONSTRAINT learner_ai_consents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS core.outbox_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  job_type VARCHAR(64) NOT NULL,
  evidence_type VARCHAR(64) NOT NULL,
  evidence_id UUID,
  evidence_ids JSONB,
  idempotency_key VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  safe_error_code VARCHAR(64),
  locked_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT outbox_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT outbox_jobs_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT outbox_jobs_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT outbox_jobs_attempts_check CHECK (attempts >= 0),
  CONSTRAINT outbox_jobs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS problem_actions_recommendation_item_id_idx
  ON core.problem_actions (recommendation_item_id);

CREATE INDEX IF NOT EXISTS problem_reflections_user_problem_created_idx
  ON core.problem_reflections (user_id, provider, external_id, created_at DESC);

CREATE INDEX IF NOT EXISTS problem_reflections_user_created_idx
  ON core.problem_reflections (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS problem_timer_sessions_user_problem_created_idx
  ON core.problem_timer_sessions (user_id, provider, external_id, created_at DESC);

CREATE INDEX IF NOT EXISTS problem_timer_sessions_user_state_idx
  ON core.problem_timer_sessions (user_id, state);

CREATE INDEX IF NOT EXISTS learner_ai_consents_user_occurred_idx
  ON core.learner_ai_consents (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS outbox_jobs_claim_idx
  ON core.outbox_jobs (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS outbox_jobs_user_created_idx
  ON core.outbox_jobs (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS problem_actions_one_impression_per_item_idx
  ON core.problem_actions (user_id, recommendation_item_id)
  WHERE action_type = 'impression' AND recommendation_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS problem_timer_sessions_one_running_per_user_idx
  ON core.problem_timer_sessions (user_id)
  WHERE state = 'running';
