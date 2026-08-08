-- F38 — the tables counter maintenance needs beyond the counters themselves.
--
-- Three problems, three tables. None of them hold a counter: they hold the
-- bookkeeping that makes the counters converge.
--
--   1. Ancestor roll-up is delivered at-least-once, and a roll-up is a delta.
--      Replaying `post.created` would add the post to every ancestor twice, so
--      the applied set has to be recorded somewhere durable and checked in the
--      same transaction as the update.
--   2. Thread views are the highest-frequency write on a community and the least
--      valuable one. Writing them straight to `threads.view_count` dirties the
--      row behind the listing index on every page view of a hot thread.
--   3. A recount over 2M posts cannot run in one serverless invocation, so it
--      must be resumable: the cursor has to outlive the function.

-- 1. Roll-up ledger. One row per post whose ancestors have been counted.
--
-- Deliberately not a boolean on `posts`: the ledger is written in the same
-- transaction as the ancestor update, and a column on the hottest table on the
-- board would make every roll-up a second write to a row the read path uses.
CREATE TABLE "content_counter_rollups" (
  "post_id" integer PRIMARY KEY REFERENCES "posts"("id") ON DELETE cascade,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- 2. Buffered thread views.
--
-- A view is an increment against one narrow row, flushed into `threads` by a
-- scheduled task. Two things follow: a burst of views on one thread collapses
-- into a single `threads` update, and losing the buffer loses view counts —
-- which is the correct trade, because a view count is the one counter on the
-- board nobody can audit and nothing depends on.
CREATE TABLE "thread_view_buffer" (
  "thread_id" integer PRIMARY KEY REFERENCES "threads"("id") ON DELETE cascade,
  "pending" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- 3. Recount progress.
--
-- `phase` names which counter family is being rebuilt and `cursor` the last id
-- completed within it, so a run that is cut short resumes at the next id rather
-- than restarting the scan. A single row keyed 'default'; the key exists so a
-- future per-community repair (F70's Recount & Rebuild) can track its own cursor
-- without a second table.
CREATE TABLE "counter_recount_state" (
  "id" text PRIMARY KEY,
  "phase" text NOT NULL DEFAULT 'threads',
  "cursor" integer NOT NULL DEFAULT 0,
  "passes" integer NOT NULL DEFAULT 0,
  "corrected" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- The flush claims the oldest buffered threads; the recount scans ids in order.
CREATE INDEX "thread_view_buffer_updated_idx" ON "thread_view_buffer" ("updated_at");
--> statement-breakpoint

-- Roll-up and recount both count *visible* posts by author. Without this the
-- per-user recount is a sequential scan of `posts` for every batch of users.
CREATE INDEX IF NOT EXISTS "posts_author_visible_idx"
  ON "posts" ("author_user_id")
  WHERE "visibility" = 'visible';
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "threads_author_visible_idx"
  ON "threads" ("author_user_id")
  WHERE "visibility" = 'visible';
