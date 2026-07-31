/**
 * The event handlers this deployment runs (F07/F38).
 *
 * `@forum/events` owns the registry and the relay; this is where a registered
 * event name becomes actual work, for the same reason `task-workers.ts` exists:
 * a domain package cannot know that "roll the counters up" means SQL.
 *
 * A *fresh* registry per container rather than the module-level singleton in
 * `@forum/events`: registration throws on a duplicate id (deliberately — ids are
 * queue idempotency keys), and a dev server re-evaluating this module against a
 * retained global would throw on the second HMR pass.
 */
import { EventRegistry } from '@forum/events'

export interface EventHandlerDeps {
  /** F38's roll-up. Returns false when the event has already been applied. */
  readonly counters: {
    rollUpAncestors(postId: number): Promise<boolean>
    /** F41's reverse. Also returns false when there was nothing to do. */
    applyVisibilityChange(postId: number): Promise<boolean>
  }
}

export function buildEventRegistry(deps: EventHandlerDeps): EventRegistry {
  return new EventRegistry().register({
    /*
     * Stable across deploys: this id is half of the queue idempotency key
     * (`outbox:<row>:<handler>`), so renaming it would let an in-flight job be
     * enqueued a second time under the new name.
     */
    id: 'counters.rollup',
    event: 'post.created',
    async handle(payload) {
      /*
       * At-least-once delivery is the contract, not a caveat: the relay
       * re-claims anything it did not mark, and the queue re-runs a job whose
       * worker died mid-handler. The repository's ledger makes the second
       * delivery a no-op, which is why nothing here tries to detect one.
       */
      await deps.counters.rollUpAncestors(payload.postId)
    },
  }).register({
    /*
     * F41's other direction. A separate handler rather than a branch inside the
     * roll-up, because the two subscribe to different events and the queue
     * dedupes on `outbox:<row>:<handler>` — one id covering both would make a
     * create and a visibility change on the same row look like the same job.
     */
    id: 'counters.visibility',
    event: 'post.visibility_changed',
    async handle(payload) {
      /*
       * The payload's `visible` flag is deliberately not read. Delivery is
       * at-least-once and unordered, so the handler asks the row what is true
       * now; a delete and a restore arriving backwards then still converge.
       */
      await deps.counters.applyVisibilityChange(payload.postId)
    },
  })
}
