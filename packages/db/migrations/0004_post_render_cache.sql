-- F36 — where a rendered post body lives.
--
-- `posts.message` is the raw BBCode the member typed and stays the source of
-- truth; these two columns are a cache of what `@forum/bbcode` makes of it.
-- Both are needed, and the version is the important one: HTML with no record of
-- which renderer produced it can only be invalidated by rewriting every row,
-- which on a 2M-post board is a migration nobody can run during a security fix.
--
-- With the version stored, bumping `RENDER_VERSION` in code invalidates every
-- cached render at once and for free — the read path renders live for anything
-- stale, and `posts.render_backfill` rewrites them in bounded batches. That is
-- the entire lazy invalidation/backfill mechanism F36 asks for.
--
-- Existing rows get `NULL` and version 0 deliberately. Postgres cannot run the
-- TypeScript renderer, so a backfill inside this migration is impossible; the
-- rows are simply stale from birth and the task picks them up. Nothing breaks
-- in between, because a stale render is a live render.
ALTER TABLE "posts" ADD COLUMN "message_html" text;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "render_version" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- The backfill's only query: "the next N posts not at version X, by id".
--
-- Leading with the version rather than the id is what makes it an index *seek*
-- once the board is mostly current — the common case, where the answer is
-- "none" and must not cost a scan of every post on the board to discover.
CREATE INDEX IF NOT EXISTS "posts_render_version_idx"
  ON "posts" ("render_version", "id");
