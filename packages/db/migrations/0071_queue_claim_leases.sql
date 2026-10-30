ALTER TABLE "outbox" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "claim_token" text;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "claim_token" text;
