ALTER TABLE "posts" ADD COLUMN "message_html" text;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "render_version" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "posts_render_version_idx"
  ON "posts" ("render_version", "id");
