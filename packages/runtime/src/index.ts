/**
 * `@meith/runtime` — the scheduler, composed over real infrastructure.
 *
 * This package exists because **three entry points need the same wiring**: the
 * Next app's `/api/system/tick`, the operator CLI's `task:run`, and the
 * self-hosted worker loop. Before it, that wiring lived in
 * `apps/forum/src/server/` behind `server-only`, which is correct for the app
 * and unusable from the other two — so the CLI would have had to build its own
 * copy of "which tasks exist and what backs them", and the two would drift the
 * first time a task was added to one and not the other.
 *
 * It is deliberately **not** a domain package. Domain packages take repository
 * interfaces and never import `@meith/db` (R2, enforced by dependency-cruiser);
 * this one's whole job is to pick the concrete implementations, which is the
 * composition-root role `container.ts` plays for the request path. It is
 * excluded from the `DOMAIN` list in `.dependency-cruiser.cjs` for exactly that
 * reason, and that exclusion is the thing to be suspicious of if anything else
 * ever wants to live here: the test is "does this choose an implementation?",
 * not "is this convenient to share?".
 */
export { buildSchedulerBundle, type SchedulerBundle } from './scheduler-bundle'
export { buildEventRegistry, type EventHandlerDeps } from './event-handlers'
export { resolveMailBrand, DEFAULT_THEME_KEY } from './mail-brand'
export { pluginTasks } from './plugin-tasks'
export { taskWorkers, defaultPromotionGuards, type TaskWorkerDeps } from './task-workers'
export { SEED_GROUP } from './groups'
