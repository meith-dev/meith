ALTER TABLE "polls" ADD COLUMN "max_options" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "allow_revote" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "public_votes" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_max_options_check" CHECK ("max_options" >= 0);
--> statement-breakpoint

ALTER TABLE "poll_votes" DROP CONSTRAINT "poll_votes_pkey";
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("poll_id", "user_id", "option_id");
--> statement-breakpoint
CREATE INDEX "poll_votes_option_idx" ON "poll_votes" ("poll_id", "option_id", "user_id");
