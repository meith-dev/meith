-- F58 — signatures.
--
-- Three columns on `users` rather than a table: a member has exactly one
-- signature, it is read with every post they wrote, and a join per postbit to
-- fetch one row would be a join on the board's heaviest page.
--
-- The render pair is F36's, for the third time (`posts`, `private_messages`,
-- now this). A signature is BBCode written by a member and shown under every
-- one of their posts, so it is exactly the kind of thing a renderer security
-- fix must reach — and storing the version alongside the HTML is what lets
-- bumping `RENDER_VERSION` invalidate every signature on the board at once.
--
-- **What is deliberately absent is the avatar.** F58's other half needs an
-- upload, and uploads are F42 — see `docs/deviations.md` D61 for why a remote
-- avatar URL is not a safe substitute rather than merely an unbuilt one.

ALTER TABLE "users" ADD COLUMN "signature" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signature_html" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signature_render_version" smallint NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Moderation (the "moderated" half of F58's acceptance).
--
-- A lock rather than a delete: a moderator who empties a signature has left
-- nothing to stop it being typed again the next minute, and nothing that says
-- it was a decision rather than an accident. Locked keeps the text — so an
-- appeal can look at what was actually there — and stops it rendering and stops
-- the member editing it.
ALTER TABLE "users" ADD COLUMN "signature_locked" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Why, in the moderator's words. Shown to the member on their own signature
-- screen: "your signature has been locked" with no reason is how somebody
-- concludes the board is broken rather than that they broke a rule.
ALTER TABLE "users" ADD COLUMN "signature_locked_reason" text;
--> statement-breakpoint

-- F36's backfill predicate, matching `posts` and `private_messages`. A stale
-- render is a live render; the task rewrites them in bounded batches.
CREATE INDEX "users_signature_render_version_idx"
  ON "users" ("signature_render_version", "id")
  WHERE "signature" <> '';
