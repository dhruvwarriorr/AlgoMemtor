ALTER TABLE core.coach_messages
  ADD COLUMN IF NOT EXISTS rich_content JSONB;
