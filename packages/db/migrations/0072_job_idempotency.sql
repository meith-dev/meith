UPDATE "jobs" SET "idempotency_key" = NULL WHERE "idempotency_key" = '';
--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY idempotency_key
    ORDER BY CASE status WHEN 'done' THEN 0 WHEN 'running' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END, id
  ) AS position
  FROM jobs WHERE idempotency_key IS NOT NULL
)
UPDATE jobs j
SET idempotency_key = NULL,
    status = CASE WHEN j.status IN ('pending', 'running') THEN 'dead' ELSE j.status END,
    last_error = CASE WHEN j.status IN ('pending', 'running') THEN 'Duplicate idempotency key retired during migration.' ELSE j.last_error END,
    locked_until = NULL, locked_by = NULL
FROM ranked r WHERE j.id = r.id AND r.position > 1;
--> statement-breakpoint
DROP INDEX "jobs_idempotency_key";--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key" ON "jobs" USING btree ("idempotency_key") WHERE "jobs"."idempotency_key" is not null;