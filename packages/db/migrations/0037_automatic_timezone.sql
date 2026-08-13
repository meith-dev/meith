ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'auto';--> statement-breakpoint

UPDATE "users" SET "timezone" = 'auto' WHERE "timezone" = 'UTC';
