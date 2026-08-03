-- F83 — the installer's one-time marker.
--
-- One row, and a check constraint says so — the same shape `board_stats` uses.
-- A table that *can* hold two rows is a table that eventually does, and "which
-- of these two rows means the board is installed" is not a question worth
-- inventing.
--
-- This is one of two independent gates. The other is "does the board have any
-- accounts", which needs no schema and covers the case this row cannot: a run
-- that created the administrator and failed before reaching here. Either gate
-- alone would leave a hole; together, installing twice is impossible.
CREATE TABLE "install_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- The version that installed the board. F84's upgrade path reads it to know
	-- where a board started, which a migration list alone cannot say.
	"installed_version" text NOT NULL,
	CONSTRAINT "install_state_single_row" CHECK ("id" = 1)
);
