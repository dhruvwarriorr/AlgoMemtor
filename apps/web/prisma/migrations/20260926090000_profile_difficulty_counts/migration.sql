-- All-time solved counts per difficulty from a public provider profile.
ALTER TABLE "core"."provider_profile_snapshots" ADD COLUMN "difficulty_counts" JSONB;
