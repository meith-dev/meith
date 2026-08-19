CREATE TABLE "plugin_health" (
	"plugin_key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
