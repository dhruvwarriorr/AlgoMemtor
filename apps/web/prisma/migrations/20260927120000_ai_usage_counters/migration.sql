-- CreateTable
CREATE TABLE "core"."ai_usage_counters" (
    "subject" VARCHAR(64) NOT NULL,
    "bucket" VARCHAR(32) NOT NULL,
    "window_kind" VARCHAR(8) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_counters_pkey" PRIMARY KEY ("subject","bucket","window_kind","window_start")
);

-- CreateIndex
CREATE INDEX "ai_usage_counters_window_start_idx" ON "core"."ai_usage_counters"("window_start");
