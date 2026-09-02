ALTER TABLE "users" ADD COLUMN "auto_watch_own_threads" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_watch_replied_threads" text DEFAULT 'none' NOT NULL;