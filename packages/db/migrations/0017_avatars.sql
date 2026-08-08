-- F58 — avatars. The half `0014` said was waiting for F42.
--
-- Columns on `users` rather than a table, for `0014`'s reason: a member has
-- exactly one, and it is read with every post they wrote. A join per postbit to
-- fetch one row would be a join on the board's heaviest page.
--
-- **The lifecycle is F42's, not a second one.** An upload lands `pending` with
-- its bytes under `avatar_source_key`; a queued job decodes it, re-encodes it
-- from raw pixels, writes the result under `avatar_key`, and only then is it
-- `ready`. Nothing serves a row that is not. See D65 for why validation cannot
-- substitute for that, and ADR 0003 for why nothing decodes on the request
-- path.
--
-- Two things follow from an avatar being *not* an attachment, though:
--
--   * **There is one per member, and a new one replaces the old.** So the
--     columns are overwritten in place, and the previous object has to be
--     handed to the sweep rather than simply dropped — which is what
--     `attachment_orphans` is for. That table's name is F42's because that is
--     where it started; what it holds is "object keys nothing owns", and
--     avatars are the second thing to need exactly that. A second identical
--     table would be worse than a name that is one feature out of date.
--   * **It is shown to people who are not reading a thread.** A member list, a
--     profile, a quote — so the permission that governs it is `profile.view`
--     rather than anything community-scoped.
--
-- Moderation is `0014`'s lock, for `0014`'s reason: a moderator who deletes an
-- avatar has left nothing to stop the same image being uploaded again the next
-- minute, and nothing that says it was a decision. Locking stops it rendering,
-- stops the member replacing it, keeps the object so an appeal can see what was
-- there, and records why.

-- `none | pending | ready | failed`. `none` rather than a nullable status: a
-- member who has never uploaded one is a real state and the commonest, and it
-- should not be spelled as an absence that every query has to coalesce.
ALTER TABLE "users" ADD COLUMN "avatar_status" text NOT NULL DEFAULT 'none';
--> statement-breakpoint

-- What the board serves. NULL until processing succeeds.
ALTER TABLE "users" ADD COLUMN "avatar_key" text;
--> statement-breakpoint
-- What the member uploaded. NULL once it does.
ALTER TABLE "users" ADD COLUMN "avatar_source_key" text;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "avatar_width" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_height" integer;
--> statement-breakpoint

-- Shown to the uploader. "Your avatar could not be processed" with no reason is
-- a bug report nobody can act on.
ALTER TABLE "users" ADD COLUMN "avatar_failure_reason" text;
--> statement-breakpoint

-- Part of the served URL, so a replaced avatar is a different URL and no cache
-- anywhere shows the old one. A timestamp rather than a counter because it is
-- also the answer to "when did this change", which a moderator asks.
ALTER TABLE "users" ADD COLUMN "avatar_updated_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "avatar_locked" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_locked_reason" text;
--> statement-breakpoint

-- Two rows can never claim the same object, which is what makes deleting one
-- member's object safe without checking whether another member points at it.
-- Partial, because almost every row has neither key.
CREATE UNIQUE INDEX "users_avatar_key_key" ON "users" ("avatar_key")
  WHERE "avatar_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_avatar_source_key_key" ON "users" ("avatar_source_key")
  WHERE "avatar_source_key" IS NOT NULL;
--> statement-breakpoint

-- The sweep for uploads a job never finished, matching `attachments_pending_idx`.
CREATE INDEX "users_avatar_pending_idx" ON "users" ("avatar_updated_at")
  WHERE "avatar_status" = 'pending';
