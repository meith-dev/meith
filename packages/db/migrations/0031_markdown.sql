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

DROP INDEX IF EXISTS "posts_vocab_version_idx";--> statement-breakpoint
CREATE INDEX "posts_render_state_idx" ON "posts" ("body_format", "vocab_version", "id");--> statement-breakpoint
DROP INDEX IF EXISTS "private_messages_vocab_version_idx";--> statement-breakpoint
CREATE INDEX "private_messages_render_state_idx" ON "private_messages" ("body_format", "vocab_version", "id");--> statement-breakpoint

ALTER TABLE "custom_bbcode" RENAME TO "custom_directives";--> statement-breakpoint
ALTER INDEX "custom_bbcode_name_key" RENAME TO "custom_directives_name_key";--> statement-breakpoint

UPDATE "cache_versions" SET "key" = 'markdown_vocabulary' WHERE "key" = 'bbcode_vocabulary';
