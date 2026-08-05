-- Markdown replaces BBCode, everywhere, with no second renderer left behind.
--
-- ## The shape of the problem
--
-- Five tables hold member-written source: `posts`, `private_messages`,
-- `users.signature`, `announcements` and `post_drafts`. Every row in all five was
-- written as BBCode. There is no SQL that converts BBCode to Markdown — the
-- conversion is a parser, and it lives in `@meith/markdown`'s `bbcode.ts` — so
-- this migration cannot rewrite the text. What it can do is **say which
-- language each row is in**, which is the thing that makes converting them
-- afterwards safe, resumable, and impossible to do twice.
--
-- ## Why the default is added twice
--
--   ALTER TABLE posts ADD COLUMN body_format smallint NOT NULL DEFAULT 0;
--   ALTER TABLE posts ALTER COLUMN body_format SET DEFAULT 1;
--
-- The first statement is metadata-only on the Postgres versions this board
-- targets: it stamps every existing row `0` (BBCode) without rewriting a table
-- that may hold two million posts. The second changes what *future* rows get
-- without touching the ones already there, so a write path that somehow failed
-- to name the column would still store the truth.
--
-- Getting this backwards would be the one unrecoverable mistake in the whole
-- migration: a Markdown post mislabelled as BBCode gets run through the
-- converter, comes back with its asterisks escaped, and there is no way to tell
-- afterwards that it happened. A BBCode post mislabelled as Markdown shows a
-- few `[b]` tags until somebody notices. The failure directions are not
-- symmetric, and the defaults above are chosen for that.
--
-- ## Conversion is the backfill's job
--
-- F36's render backfill already asks "which rows are not on the current
-- renderer" and rewrites them behind the read path. `RENDER_VERSION` went from
-- 1 to 2 in this release, so **every** row is stale from the moment this
-- deploys — which is exactly the mechanism a renderer change was always meant
-- to use. The backfill now also converts a row's source the first time it
-- touches it and stamps `body_format = 1`, so the conversion happens once, in
-- batches, and never on a page load.
--
-- Until it catches up, a legacy row is converted *in memory* on read. Nothing
-- looks broken while the sweep runs.
--
-- ## Renames
--
-- `custom_bbcode` becomes `custom_directives`: the feature survives the change
-- of markup language, but `[spoiler]…[/spoiler]` is now `:::spoiler` (block) or
-- `:spoiler[…]` (inline), and a table called `custom_bbcode` holding directive
-- names would be a lie that outlives everyone who remembers why.

ALTER TABLE "posts" ADD COLUMN "body_format" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "body_format" SET DEFAULT 1;--> statement-breakpoint

ALTER TABLE "private_messages" ADD COLUMN "body_format" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "private_messages" ALTER COLUMN "body_format" SET DEFAULT 1;--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "signature_format" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "signature_format" SET DEFAULT 1;--> statement-breakpoint

ALTER TABLE "announcements" ADD COLUMN "body_format" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "body_format" SET DEFAULT 1;--> statement-breakpoint

ALTER TABLE "post_drafts" ADD COLUMN "body_format" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "post_drafts" ALTER COLUMN "body_format" SET DEFAULT 1;--> statement-breakpoint

-- The backfill's predicate is now three columns wide, and it runs over the
-- largest table on the board. Its index has to cover the third one or the
-- planner falls back to a sequential scan the moment the first two agree.
DROP INDEX IF EXISTS "posts_vocab_version_idx";--> statement-breakpoint
CREATE INDEX "posts_render_state_idx" ON "posts" ("body_format", "vocab_version", "id");--> statement-breakpoint
DROP INDEX IF EXISTS "private_messages_vocab_version_idx";--> statement-breakpoint
CREATE INDEX "private_messages_render_state_idx" ON "private_messages" ("body_format", "vocab_version", "id");--> statement-breakpoint

-- Custom BBCode tags become custom directives. Same columns, same safety
-- argument — a name and inline-or-block, never markup — and a name that now
-- reads as what it is.
ALTER TABLE "custom_bbcode" RENAME TO "custom_directives";--> statement-breakpoint
ALTER INDEX "custom_bbcode_name_key" RENAME TO "custom_directives_name_key";--> statement-breakpoint

-- The vocabulary's cache key, for the same reason.
UPDATE "cache_versions" SET "key" = 'markdown_vocabulary' WHERE "key" = 'bbcode_vocabulary';
