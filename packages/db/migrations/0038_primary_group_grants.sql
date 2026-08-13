ALTER TABLE "user_group_memberships" ADD COLUMN "previous_primary_group_id" integer;--> statement-breakpoint

ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_previous_primary_group_id_usergroups_id_fk" FOREIGN KEY ("previous_primary_group_id") REFERENCES "public"."usergroups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "user_group_memberships_previous_primary_idx" ON "user_group_memberships" ("user_id") WHERE "previous_primary_group_id" is not null;
