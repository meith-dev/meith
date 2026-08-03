-- F75 — the online list's record, the board's rolled-up statistics, and
-- browsing without appearing in either.
--
-- ## Why `board_stats` is one row with a check constraint
--
-- `id` is a smallint that is always 1, and the constraint says so. "There is
-- exactly one row of board statistics" then becomes something the database
-- holds rather than something every reader hopes for — and a second row,
-- inserted by a well-meaning script or a half-written migration, cannot silently
-- become the one a query happens to read first.
--
-- A key/value table was the alternative. It makes reading six numbers six rows,
-- and it makes updating all six atomically impossible, which matters because
-- these numbers are read together and a page showing last hour's thread count
-- beside this minute's post count is worse than one that is uniformly ten
-- minutes old.
--
-- ## Why the totals are a rollup and the record is not
--
-- `thread_count`, `post_count` and `member_count` are recomputed by a scheduled
-- task. F38's counters already do the incremental work per forum and per user,
-- so summing the forum table is cheap — but `member_count` is a count of
-- `users`, and that is not free at two hundred thousand accounts. The page shows
-- `computed_at` rather than implying "now": a number that is ten minutes old and
-- says so beats one that is exact and costs a sequential scan per page view.
--
-- `most_online_count` is a **record**, and a record is written the moment it is
-- beaten. It is a conditional UPDATE whose `where` is the comparison, so two
-- peaks arriving together keep the higher — which is the only case where the
-- difference between that and a read-then-write is visible.
--
-- ## Why `invisible` is a column on `users`
--
-- Beside F57's other preferences and for the same reason: it is read for every
-- member the online panel lists, and a join for a row that always exists is a
-- join on every page that shows the list.
--
-- It hides a member from the list **and from the count**. Hiding them from the
-- list alone leaves invisibility as a puzzle anybody can solve by subtraction —
-- "eleven online, ten listed" names an invisible member as surely as printing
-- their name would. Staff see them, marked as invisible, because moderating
-- requires knowing who is present.

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
-- The singleton, created here so no reader has to handle "no row yet" and no
-- writer has to upsert. Zeroes until the first rollup runs; `computed_at` stays
-- null until then, which is what the page tests to say "not computed yet"
-- rather than showing three convincing zeroes.
INSERT INTO "board_stats" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
