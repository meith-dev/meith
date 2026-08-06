ALTER TABLE "users" ADD COLUMN "signature" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signature_html" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signature_render_version" smallint NOT NULL DEFAULT 0;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "signature_locked" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "signature_locked_reason" text;
--> statement-breakpoint

CREATE INDEX "users_signature_render_version_idx"
  ON "users" ("signature_render_version", "id")
  WHERE "signature" <> '';
