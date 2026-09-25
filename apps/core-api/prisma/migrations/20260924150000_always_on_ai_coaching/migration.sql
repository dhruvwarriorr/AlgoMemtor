-- Personalized coaching and learner memory are now product-default features.
-- Keep the consent history for auditability, but append an effective current
-- policy row for every existing account so old opt-outs cannot block the
-- always-on product behavior.
INSERT INTO core.learner_ai_consents (user_id, enabled, policy_version)
SELECT users.id, TRUE, 'personalized-coaching-rag-v2'
FROM core.users AS users
WHERE NOT EXISTS (
  SELECT 1
  FROM core.learner_ai_consents AS consents
  WHERE consents.user_id = users.id
    AND consents.enabled = TRUE
    AND consents.policy_version = 'personalized-coaching-rag-v2'
);
