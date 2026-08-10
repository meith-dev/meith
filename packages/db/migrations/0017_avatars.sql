ALTER TABLE "users" ADD COLUMN "avatar_status" text NOT NULL DEFAULT 'none';
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "avatar_key" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_source_key" text;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "avatar_width" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_height" integer;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "avatar_failure_reason" text;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "avatar_updated_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "avatar_locked" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_locked_reason" text;
--> statement-breakpoint

CREATE UNIQUE INDEX "users_avatar_key_key" ON "users" ("avatar_key")
  WHERE "avatar_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_avatar_source_key_key" ON "users" ("avatar_source_key")
  WHERE "avatar_source_key" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "users_avatar_pending_idx" ON "users" ("avatar_updated_at")
  WHERE "avatar_status" = 'pending';
