ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "posts_per_page" smallint;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "threads_per_page" smallint;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "location" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "website" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;
