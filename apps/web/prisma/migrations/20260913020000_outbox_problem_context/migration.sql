ALTER TABLE core.outbox_jobs
  ADD COLUMN IF NOT EXISTS problem_provider VARCHAR(32),
  ADD COLUMN IF NOT EXISTS problem_external_id VARCHAR(128);

ALTER TABLE core.outbox_jobs
  DROP CONSTRAINT IF EXISTS outbox_jobs_problem_identity_check;

ALTER TABLE core.outbox_jobs
  ADD CONSTRAINT outbox_jobs_problem_identity_check
  CHECK (
    (problem_provider IS NULL) = (problem_external_id IS NULL)
    AND (problem_provider IS NULL OR problem_provider IN ('codeforces'))
    AND (problem_external_id IS NULL OR (btrim(problem_external_id) <> '' AND problem_external_id !~ '[[:space:]]'))
  );

CREATE INDEX IF NOT EXISTS outbox_jobs_problem_context_idx
  ON core.outbox_jobs (user_id, problem_provider, problem_external_id);
