CREATE TABLE IF NOT EXISTS core.coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(1000),
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

ALTER TABLE core.normalized_topics
  ADD COLUMN IF NOT EXISTS prerequisites TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS coach_conversations_user_updated_idx
  ON core.coach_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS core.coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES core.coach_conversations(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  transient_context_omitted BOOLEAN NOT NULL DEFAULT false,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
  fallback BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_messages_conversation_created_idx
  ON core.coach_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS core.coach_action_proposals (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES core.coach_conversations(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('proposed', 'confirmed', 'rejected', 'expired')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_action_proposals_user_status_idx
  ON core.coach_action_proposals(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS core.coach_roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES core.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.coach_roadmap_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  roadmap_id UUID NOT NULL REFERENCES core.coach_roadmaps(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_roadmap_revisions_user_version_idx
  ON core.coach_roadmap_revisions(user_id, version);

CREATE INDEX IF NOT EXISTS coach_roadmap_revisions_roadmap_created_idx
  ON core.coach_roadmap_revisions(roadmap_id, created_at DESC);

CREATE TABLE IF NOT EXISTS core.coach_topic_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  topic VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('working_on', 'practiced', 'completed', 'revisit', 'skip_for_now')),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  UNIQUE(user_id, topic)
);

CREATE TABLE IF NOT EXISTS core.coach_topic_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  topic VARCHAR(64) NOT NULL,
  status VARCHAR(24) CHECK (status IS NULL OR status IN ('working_on', 'practiced', 'completed', 'revisit', 'skip_for_now')),
  source VARCHAR(24) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_topic_status_events_user_topic_created_idx
  ON core.coach_topic_status_events(user_id, topic, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_topic_statuses_user_updated_idx
  ON core.coach_topic_statuses(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS core.coach_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES core.users(id) ON DELETE CASCADE,
  weekly_enabled BOOLEAN NOT NULL DEFAULT false,
  weekly_day INTEGER NOT NULL DEFAULT 0 CHECK (weekly_day BETWEEN 0 AND 6),
  weekly_time VARCHAR(5) NOT NULL DEFAULT '09:00' CHECK (weekly_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  event_enabled BOOLEAN NOT NULL DEFAULT false,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.coach_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  event_key VARCHAR(160),
  type VARCHAR(32) NOT NULL,
  title VARCHAR(160) NOT NULL,
  content VARCHAR(4000) NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  fallback BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_check_ins_user_created_idx
  ON core.coach_check_ins(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coach_check_ins_user_read_idx
  ON core.coach_check_ins(user_id, read);
