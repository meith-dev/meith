ALTER TABLE "posts" RENAME COLUMN "legacy_mybb_pid" TO "legacy_id";--> statement-breakpoint
ALTER TABLE "threads" RENAME COLUMN "legacy_mybb_tid" TO "legacy_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "legacy_mybb_uid" TO "legacy_id";--> statement-breakpoint
ALTER TABLE "forums" RENAME COLUMN "legacy_mybb_fid" TO "legacy_id";--> statement-breakpoint
DROP INDEX "posts_legacy_mybb_pid_key";--> statement-breakpoint
DROP INDEX "threads_legacy_mybb_tid_key";--> statement-breakpoint
DROP INDEX "users_legacy_mybb_uid_key";--> statement-breakpoint
DROP INDEX "forums_legacy_mybb_fid_key";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
ALTER TABLE "reputation" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
ALTER TABLE "bans" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
ALTER TABLE "warnings" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
ALTER TABLE "private_messages" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_legacy_id_key" ON "attachments" USING btree ("legacy_id") WHERE "attachments"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_legacy_id_key" ON "posts" USING btree ("legacy_id") WHERE "posts"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_legacy_id_key" ON "reputation" USING btree ("legacy_id") WHERE "reputation"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "threads_legacy_id_key" ON "threads" USING btree ("legacy_id") WHERE "threads"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "bans_legacy_id_key" ON "bans" USING btree ("legacy_id") WHERE "bans"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_legacy_id_key" ON "users" USING btree ("legacy_id") WHERE "users"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "warnings_legacy_id_key" ON "warnings" USING btree ("legacy_id") WHERE "warnings"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "private_messages_legacy_id_key" ON "private_messages" USING btree ("legacy_id") WHERE "private_messages"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "forums_legacy_id_key" ON "forums" USING btree ("legacy_id") WHERE "forums"."legacy_id" is not null;--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "legacy_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "polls_legacy_id_key" ON "polls" ("legacy_id") WHERE "legacy_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "poll_options_poll_order_key" ON "poll_options" ("poll_id", "display_order");
