UPDATE core.learner_profiles
SET answers =
  (answers - 'target' - 'practiceAvailability')
  || jsonb_build_object(
    'topicPreference',
    CASE
      WHEN jsonb_typeof(answers -> 'topicPreference') = 'object'
        THEN (answers -> 'topicPreference') - 'otherTopic'
      ELSE answers -> 'topicPreference'
    END
  )
WHERE answers ? 'target'
   OR answers ? 'practiceAvailability'
   OR (answers -> 'topicPreference') ? 'otherTopic';
