CREATE TABLE "marketplace_catalog" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"feed" jsonb,
	"source_url" text,
	"fetched_at" timestamp with time zone,
	"error" text,
	"error_at" timestamp with time zone,
	"notified_updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_catalog_single_row" CHECK ("marketplace_catalog"."id" = 1)
);
