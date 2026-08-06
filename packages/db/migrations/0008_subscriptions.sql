ALTER TABLE "thread_subscriptions" RENAME COLUMN "notify_via" TO "mode";
--> statement-breakpoint

UPDATE "thread_subscriptions" SET "mode" = 'instant' WHERE "mode" <> 'none';
--> statement-breakpoint

ALTER TABLE "thread_subscriptions" ALTER COLUMN "mode" SET DEFAULT 'instant';
--> statement-breakpoint

ALTER TABLE "thread_subscriptions"
  ADD COLUMN "last_notified_post_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

CREATE INDEX "thread_subscriptions_user_idx"
  ON "thread_subscriptions" ("user_id", "created_at" DESC NULLS LAST);
--> statement-breakpoint

CREATE INDEX "thread_subscriptions_mode_idx"
  ON "thread_subscriptions" ("mode", "user_id");
--> statement-breakpoint

ALTER TABLE "forum_subscriptions" RENAME COLUMN "notify_via" TO "mode";
--> statement-breakpoint

UPDATE "forum_subscriptions" SET "mode" = 'instant' WHERE "mode" <> 'none';
--> statement-breakpoint

ALTER TABLE "forum_subscriptions" ALTER COLUMN "mode" SET DEFAULT 'instant';
--> statement-breakpoint

ALTER TABLE "forum_subscriptions"
  ADD COLUMN "last_notified_post_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

CREATE INDEX "forum_subscriptions_user_idx"
  ON "forum_subscriptions" ("user_id", "created_at" DESC NULLS LAST);
--> statement-breakpoint

CREATE INDEX "forum_subscriptions_mode_idx"
  ON "forum_subscriptions" ("mode", "user_id");
--> statement-breakpoint

CREATE TABLE "digest_runs" (
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "cadence" text NOT NULL,
  "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "digest_runs_pkey" PRIMARY KEY ("user_id", "cadence")
);
