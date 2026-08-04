-- F44 — separate uniqueness for thread and reply drafts; NULL cannot express it.
CREATE TABLE "post_drafts" (
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "forum_id" integer NOT NULL REFERENCES "forums"("id") ON DELETE CASCADE,
  "thread_id" integer REFERENCES "threads"("id") ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT '',
  "message" text NOT NULL DEFAULT '',
  "prefix_id" integer REFERENCES "thread_prefixes"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "post_drafts_new_thread_key" ON "post_drafts" ("user_id", "forum_id") WHERE "thread_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "post_drafts_reply_key" ON "post_drafts" ("user_id", "thread_id") WHERE "thread_id" IS NOT NULL;
