CREATE TABLE "user_relations" (
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "other_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,

  "kind" text NOT NULL,

  "created_at" timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "user_relations_pkey" PRIMARY KEY ("user_id", "other_user_id")
);
--> statement-breakpoint

CREATE INDEX "user_relations_kind_idx"
  ON "user_relations" ("user_id", "kind", "other_user_id");
--> statement-breakpoint

CREATE INDEX "user_relations_reverse_idx"
  ON "user_relations" ("other_user_id", "kind");
