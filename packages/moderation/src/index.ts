/**
 * `@forum/moderation` — F48, and the home of Phase 4's commands.
 *
 * The queue is first because it is the only moderator surface whose mechanism
 * already existed: approving is F41's `unapproved → visible`. What lives here is
 * the part F41 could not have — a list scoped by moderator rights, and a bulk
 * decision over it that re-reads every id before acting on it.
 */
export {
  ModerationQueue,
  parseSelection,
  MAX_CHUNK,
  QUEUE_PAGE_SIZE,
  type ModerationQueueRepository,
  type PendingItem,
  type QueueDecision,
  type QueueItem,
  type QueueItemKind,
  type QueueOutcome,
  type QueuePage,
  type QueueSelection,
} from './queue'
