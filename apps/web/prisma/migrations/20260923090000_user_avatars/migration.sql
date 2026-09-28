-- Learner-uploaded profile pictures (small, client-resized images).
CREATE TABLE "core"."user_avatars" (
    "user_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_avatars_mime_type_check" CHECK ("mime_type" IN ('image/webp', 'image/jpeg', 'image/png')),
    CONSTRAINT "user_avatars_byte_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 262144)
);

ALTER TABLE "core"."user_avatars" ADD CONSTRAINT "user_avatars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
