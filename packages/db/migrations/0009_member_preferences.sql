-- F57 — the member's own settings.
--
-- Six columns on `users`, and the reason they are columns rather than a
-- `user_preferences` table is the same reason F53's two restriction columns are:
-- every one of them is read on the *page render path* for the signed-in member,
-- there is exactly one of each per account, and a join for a row that always
-- exists is a join on every page of the board.
--
-- Two of them are load-bearing rather than decorative, and that is the point of
-- the feature. `view/time.ts` has formatted every timestamp on this board in UTC
-- since F29 and the footer has said so out loud, precisely because per-member
-- timezones were F57's. The page-size pair is the same story for
-- `view/paging.ts`'s two constants.

-- The member's zone, as an IANA name ('Europe/London'), validated against the
-- runtime's own tz database before it is written — never a numeric offset.
-- An offset cannot express summer time, so a board that stored `+01:00` would be
-- an hour wrong for half the year in most of Europe, and wrong in a way that
-- reads as a bug in the *timestamp* rather than in the setting.
--
-- NOT NULL with a default, because every render needs an answer and a null that
-- means "UTC" would be a second way of saying the same thing.
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint

-- Page sizes. NULL means "whatever the board says", which is what keeps an
-- operator's `display.posts_per_page` change meaningful for everybody who has
-- never opened this screen — the same override-only shape `settings` and
-- `notification_preferences` use.
ALTER TABLE "users" ADD COLUMN "posts_per_page" smallint;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "threads_per_page" smallint;
--> statement-breakpoint

-- The public profile a member writes about themselves.
--
-- Three plain-text columns, deliberately: a signature is F58 (it is BBCode, it
-- is group-limited and it is moderated, which makes it a different thing), and
-- arbitrary member-defined fields are F59's typed registry. These three are the
-- ones every board has and no board configures.
ALTER TABLE "users" ADD COLUMN "location" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "website" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;
