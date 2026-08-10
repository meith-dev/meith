CREATE TABLE "install_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"installed_version" text NOT NULL,
	CONSTRAINT "install_state_single_row" CHECK ("id" = 1)
);
