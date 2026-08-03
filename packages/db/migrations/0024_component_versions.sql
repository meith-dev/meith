-- F84 — what version each part of this board is at.
--
-- Two tables, and they answer different questions. `component_versions` says
-- what version core and each plugin are recorded at; `plugin_migrations` says
-- which of a plugin's migrations have run.
--
-- They are separate because a plugin can ship a release with no migrations
-- (behaviour changed, schema did not) and a migration list alone could not tell
-- that board it was out of date — which is the failure the ACP notice exists to
-- prevent.
CREATE TABLE "component_versions" (
	-- 'core', or 'plugin:<key>'. One namespace, so the ACP reads one table.
	"component" text PRIMARY KEY,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- One row per applied plugin migration, and the primary key is the pair.
--
-- The uniqueness is the idempotency: an upgrade interrupted halfway re-runs and
-- the insert for an already-applied id conflicts, so a migration cannot be
-- applied twice by a nervous operator pressing the button again.
CREATE TABLE "plugin_migrations" (
	"plugin_key" text NOT NULL,
	"migration_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("plugin_key", "migration_id")
);
