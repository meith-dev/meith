-- A group's colour, so a member's name carries their standing wherever it appears.
--
-- `usergroups` has had `badge_token` since the initial schema: a *token name*
-- from the R7 set, so that a group's badge could be restyled by a theme rather
-- than by pasting a colour into a database. It is written by the group editor
-- and read by nothing, and the four tokens it was meant to name — `group-admin`,
-- `group-supermod`, `group-mod`, `group-banned` — are a fixed list, which is the
-- reason it never got a reader. Groups are rows. A board with two moderator
-- tiers and a "veterans" group cannot name a token that does not exist, and it
-- cannot add one, because the token list is compiled into the stylesheet.
--
-- So the colour lives on the row, in the two forms a board needs.
--
-- ## Why two columns rather than one
--
-- The same reason the theme editor grew two fields per token. A colour chosen
-- against a white page is often unreadable on a black one, and a board that
-- stored one value would either force its operator to pick a compromise nobody
-- likes or quietly make half its members' names unreadable at night. Null in
-- either column means "no colour in that scheme", and the name renders in the
-- ordinary text colour — which is what every name does today.
--
-- ## The badge is an upload, for the same reason
--
-- `badge_token` could not name an image either. A board's "Veterans" badge is a
-- picture somebody drew, and there has never been a way to put one on the
-- board — the column named a token, the token list is fixed, and no screen ever
-- rendered it. So a badge is now a stored object like the board's logo, in the
-- same two schemes as everything else visual here.
--
-- ## Why not a token name after all
--
-- Because the value has to survive a theme change. A member's colour is a fact
-- about the *board's* hierarchy, not about the look somebody picked from the
-- switcher, and a token indirection would put it back under the theme's control
-- exactly when a member changes theme. `badge_token` stays where it is —
-- unread, and now with a note in the schema saying so — rather than being
-- dropped in the same migration that admits it did not work out.

ALTER TABLE "usergroups" ADD COLUMN "name_color_light" text;--> statement-breakpoint
ALTER TABLE "usergroups" ADD COLUMN "name_color_dark" text;--> statement-breakpoint

-- File-store keys, not URLs. Written by an upload, validated on the way in and
-- again on the way out, exactly like the board logo's.
ALTER TABLE "usergroups" ADD COLUMN "badge_image_light" text;--> statement-breakpoint
ALTER TABLE "usergroups" ADD COLUMN "badge_image_dark" text;
