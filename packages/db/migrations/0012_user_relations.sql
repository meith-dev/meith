-- F61 — buddy and ignore lists.
--
-- **One table with a `kind`, not two tables.** Buddy and ignore are mutually
-- exclusive: you cannot both follow somebody and refuse to read them, and
-- expressing that with two tables means a cross-table check nothing enforces.
-- One row per ordered pair with a kind makes it the primary key, so adding a
-- buddy who is currently ignored is an upsert rather than a delete-then-insert
-- that can half-happen.
--
-- The pair is **ordered**: (me, them) is my opinion of them, and says nothing
-- about theirs of me. Ignoring is not symmetric — that is the whole point of
-- it, and a board that made it mutual would let anybody silence themselves in
-- somebody else's eyes.

CREATE TABLE "user_relations" (
  -- Whose list this is.
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  -- Who is on it.
  "other_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,

  -- 'buddy' | 'ignore'. Text rather than an enum, like every other state column
  -- on this board: adding a kind must not need a type migration.
  "kind" text NOT NULL,

  "created_at" timestamp with time zone NOT NULL DEFAULT now(),

  -- One opinion per pair. This is what makes buddy and ignore exclusive without
  -- a check constraint, and what makes "add" idempotent.
  CONSTRAINT "user_relations_pkey" PRIMARY KEY ("user_id", "other_user_id")
);
--> statement-breakpoint

-- "My buddies" and "my ignore list": one member's rows of one kind.
CREATE INDEX "user_relations_kind_idx"
  ON "user_relations" ("user_id", "kind", "other_user_id");
--> statement-breakpoint

-- The reverse direction, for the one question asked *about* somebody rather
-- than by them: "does this recipient ignore the person writing to them" (F60's
-- private message block). Without it that is a scan of the whole table on every
-- send.
CREATE INDEX "user_relations_reverse_idx"
  ON "user_relations" ("other_user_id", "kind");
