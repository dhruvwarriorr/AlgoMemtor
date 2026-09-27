-- CodeChef solves uploaded by the browser connector record where they were
-- solved. A contest solve keeps the problem's difficulty rating; a practice
-- solve is unrated.
ALTER TABLE "core"."provider_solved_observations"
  ADD COLUMN "solve_context" VARCHAR(16),
  ADD COLUMN "difficulty_rating" INTEGER;

ALTER TABLE "core"."provider_solved_observations"
  ADD CONSTRAINT "provider_solved_observations_solve_context_check"
  CHECK ("solve_context" IS NULL OR "solve_context" IN ('contest', 'practice'));
