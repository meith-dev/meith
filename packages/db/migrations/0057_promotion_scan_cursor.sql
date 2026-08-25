CREATE TABLE "promotion_scan_state" (
	"id" text PRIMARY KEY NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"passes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
