UPDATE "navigation_items"
SET "enabled" = false
WHERE "key" IN ('unanswered', 'my-posts', 'online', 'members', 'staff')
  AND "label" = ''
  AND "parent_id" IS NULL;
