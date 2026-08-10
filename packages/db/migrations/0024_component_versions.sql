CREATE TABLE "component_versions" (
	"component" text PRIMARY KEY,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "plugin_migrations" (
	"plugin_key" text NOT NULL,
	"migration_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("plugin_key", "migration_id")
);
