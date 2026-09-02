ALTER TABLE "users" ADD COLUMN "board_digest_cadence" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "board_digest_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notification_preferences_kind_email_idx" ON "notification_preferences" USING btree ("kind","user_id") WHERE "notification_preferences"."email" = true;