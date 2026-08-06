CREATE TABLE "board_stats" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"thread_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"newest_user_id" integer,
	"newest_username" text,
	"most_online_count" integer DEFAULT 0 NOT NULL,
	"most_online_at" timestamp with time zone,
	"computed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_stats_singleton" CHECK ("board_stats"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invisible" boolean DEFAULT false NOT NULL;

--> statement-breakpoint
INSERT INTO "board_stats" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
