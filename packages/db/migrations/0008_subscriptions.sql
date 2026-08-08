-- F56 — subscriptions and digests.
--
-- `thread_subscriptions` has existed since F28 and been *written* since F39: the
-- composer's "subscribe to this thread" checkbox inserts a row, and nothing has
-- ever read one. This is what reads them, plus the community-level table MyBB has
-- and this schema did not.
--
-- Three decisions produce this shape.
--
-- **`notify_via` becomes `mode`, and it is a cadence rather than a channel.**
-- The old column held 'none' | 'email' | 'notification' — *how* to tell
-- somebody. F55 answered that question board-wide and better: every
-- notification is recorded on-site and `notification_preferences` decides
-- whether an e-mail follows, per kind, for the whole account. A per-subscription
-- channel on top of that is a second answer to a settled question, and the two
-- would disagree the first time anybody changed one. What a subscription
-- genuinely needs to say is *how often*: instant, daily, weekly — which is
-- MyBB's own subscription type, and the column is renamed and remapped rather
-- than added beside the old one, because the alternative is a vestigial column
-- that nothing reads and everybody has to reason about.
--
-- **Progress is a watermark, not a queue.** Each subscription carries the id of
-- the last post its owner was told about, so "what is outstanding" is a range
-- query rather than a table of pending rows to insert, drain and clean up. That
-- is F06's catch-up rule applied to notification: a tick that never ran, or ran
-- twice, changes when somebody is told and never whether. A missed week becomes
-- one larger digest instead of a lost one.
--
-- **The digest clock is per member and per cadence.** A member can follow one
-- thread daily and another weekly, so "is a digest due" is answered by
-- `digest_runs`, keyed by both — not by a task-wide `last_run_at`, which would
-- send everybody's digest at whatever moment the board's tick happened to fire
-- and give a member who subscribed on Sunday a first "weekly" digest on Monday.

-- ---------------------------------------------------------------- --
-- Thread subscriptions: the cadence rename, and the watermark.
-- ---------------------------------------------------------------- --

ALTER TABLE "thread_subscriptions" RENAME COLUMN "notify_via" TO "mode";
--> statement-breakpoint

-- The values map one-to-one and no board has ever written anything but the
-- default: 'notification' was "tell me", which is now "tell me as it happens".
-- 'none' survives unchanged — it means "I am following this thread but do not
-- want to hear about it", which is a real MyBB subscription type and the thing
-- F57's subscription list will show as a muted row.
UPDATE "thread_subscriptions" SET "mode" = 'instant' WHERE "mode" <> 'none';
--> statement-breakpoint

ALTER TABLE "thread_subscriptions" ALTER COLUMN "mode" SET DEFAULT 'instant';
--> statement-breakpoint

-- How far this subscription has been notified. 0 means "nothing yet", which is
-- deliberately *not* the same as "tell them about the whole thread": subscribing
-- sets it to the thread's current last post, so following a 400-post thread does
-- not produce a digest of 400 posts.
ALTER TABLE "thread_subscriptions"
  ADD COLUMN "last_notified_post_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- The management screen: one member's subscriptions, newest first.
CREATE INDEX "thread_subscriptions_user_idx"
  ON "thread_subscriptions" ("user_id", "created_at" DESC NULLS LAST);
--> statement-breakpoint

-- The notifier's read: everybody due on one cadence. Leading with the mode
-- because a run asks for exactly one, and almost every subscription on a
-- settled board is 'instant'.
CREATE INDEX "thread_subscriptions_mode_idx"
  ON "thread_subscriptions" ("mode", "user_id");
--> statement-breakpoint

-- ---------------------------------------------------------------- --
-- Community subscriptions: the same table, the same two changes.
-- ---------------------------------------------------------------- --

-- `community_subscriptions` has also existed since `0000` with no reader and the
-- same channel column. It stays a separate table from `thread_subscriptions`
-- rather than being merged into one polymorphic `subscriptions (target_kind,
-- target_id)`: the two are read by different queries — one joins `threads`, the
-- other has to match every thread beneath a community — and a polymorphic key
-- cannot carry a foreign key to either. Two narrow tables cost the notifier one
-- extra query and buy referential integrity in both.

ALTER TABLE "community_subscriptions" RENAME COLUMN "notify_via" TO "mode";
--> statement-breakpoint

UPDATE "community_subscriptions" SET "mode" = 'instant' WHERE "mode" <> 'none';
--> statement-breakpoint

ALTER TABLE "community_subscriptions" ALTER COLUMN "mode" SET DEFAULT 'instant';
--> statement-breakpoint

ALTER TABLE "community_subscriptions"
  ADD COLUMN "last_notified_post_id" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

CREATE INDEX "community_subscriptions_user_idx"
  ON "community_subscriptions" ("user_id", "created_at" DESC NULLS LAST);
--> statement-breakpoint

CREATE INDEX "community_subscriptions_mode_idx"
  ON "community_subscriptions" ("mode", "user_id");
--> statement-breakpoint

-- ---------------------------------------------------------------- --
-- When each member last received each cadence.
-- ---------------------------------------------------------------- --

-- Keyed by member *and* cadence, so a member following one thread daily and
-- another weekly gets two clocks rather than one that fires at whichever
-- interval was written last.
--
-- A row appears the first time a digest is sent, and its absence means "never
-- sent" — which the notifier treats as due, so a member who subscribes today
-- gets their first daily digest tomorrow rather than never.
CREATE TABLE "digest_runs" (
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "cadence" text NOT NULL,
  "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "digest_runs_pkey" PRIMARY KEY ("user_id", "cadence")
);
