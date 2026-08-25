CREATE TABLE "promotion_scan_state" (
  "id" text PRIMARY KEY,
  "cursor" integer NOT NULL DEFAULT 0,
  "passes" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
