CREATE TABLE "content_counter_rollups" (
  "post_id" integer PRIMARY KEY REFERENCES "posts"("id") ON DELETE cascade,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "thread_view_buffer" (
  "thread_id" integer PRIMARY KEY REFERENCES "threads"("id") ON DELETE cascade,
  "pending" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "counter_recount_state" (
  "id" text PRIMARY KEY,
  "phase" text NOT NULL DEFAULT 'threads',
  "cursor" integer NOT NULL DEFAULT 0,
  "passes" integer NOT NULL DEFAULT 0,
  "corrected" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "thread_view_buffer_updated_idx" ON "thread_view_buffer" ("updated_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "posts_author_visible_idx"
  ON "posts" ("author_user_id")
  WHERE "visibility" = 'visible';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "threads_author_visible_idx"
  ON "threads" ("author_user_id")
  WHERE "visibility" = 'visible';
