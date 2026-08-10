ALTER TABLE "user_group_memberships" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_group_memberships" ADD COLUMN "granted_by_plugin" text;--> statement-breakpoint
ALTER TABLE "user_group_memberships" ADD COLUMN "grant_reason" text;--> statement-breakpoint
CREATE INDEX "user_group_memberships_expiry_idx" ON "user_group_memberships" ("expires_at") WHERE "expires_at" is not null;--> statement-breakpoint

ALTER TABLE "usergroups" ADD COLUMN "plugin_grantable" boolean NOT NULL DEFAULT false;
