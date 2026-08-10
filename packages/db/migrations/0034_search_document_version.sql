ALTER TABLE "posts" ADD COLUMN "search_version" smallint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "search_version" SET DEFAULT 1;--> statement-breakpoint

CREATE INDEX "posts_search_version_idx" ON "posts" USING btree ("search_version","id");
