DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'problem_actions_action_type_check'
      AND conrelid = 'core.problem_actions'::regclass
  ) THEN
    ALTER TABLE core.problem_actions
      DROP CONSTRAINT problem_actions_action_type_check;
  END IF;

  ALTER TABLE core.problem_actions
    ADD CONSTRAINT problem_actions_action_type_check
    CHECK (
      action_type IN (
        'impression',
        'opened',
        'bookmarked',
        'unbookmarked',
        'dismissed',
        'dismissal_restored',
        'status_changed'
      )
    );
END
$$;
