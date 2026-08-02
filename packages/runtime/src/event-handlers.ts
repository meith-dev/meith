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
  /**
   * F55's mail delivery. Optional: a build with no mail path registers no
   * handler rather than one that throws, so the relay does not enqueue jobs
   * that can only fail. Same rule the task registry follows (D32).
   */
  readonly notifications?: {
    deliverEmail(notificationId: number): Promise<void>
  }
  /**
   * F42's re-encode. Optional for the same reason `notifications` is: a
   * deployment with no file store registers no handler rather than one that
   * can only fail, and the upload path refuses before it accepts anything.
   */
  readonly attachments?: {
    process(attachmentId: number): Promise<unknown>
  }
  /** F58's re-encode. Optional for the same reason as `attachments`. */
  readonly avatars?: {
    process(userId: number): Promise<unknown>
  }
}

export function buildEventRegistry(deps: EventHandlerDeps): EventRegistry {
  const registry = new EventRegistry().register({
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

  if (deps.attachments !== undefined) {
    registry.register({
      /*
       * F42. The whole of "an upload is made safe by being re-encoded": the row
       * is `pending` and unservable until this succeeds, and what it writes is
       * the encoder's output rather than anything the member sent.
       *
       * Idempotent in the service, not here — the row's `status = 'pending'`
       * guard lives in the UPDATE, so a redelivery is a no-op at the database
       * rather than a race this handler would have to detect.
       */
      id: 'attachments.process',
      event: 'attachment.uploaded',
      async handle(payload) {
        await deps.attachments!.process(payload.attachmentId)
      },
    })
  }

  if (deps.avatars !== undefined) {
    registry.register({
      /*
       * F58. The same lifecycle as `attachments.process` and for the same
       * reason: what a member uploaded is never what the board serves, and the
       * row is `pending` and unservable until this succeeds.
       */
      id: 'avatars.process',
      event: 'avatar.uploaded',
      async handle(payload) {
        await deps.avatars!.process(payload.userId)
      },
    })
  }

  if (deps.notifications === undefined) return registry

  return registry.register({
    /*
     * F55. This is the whole of "queued mail": the notification and its outbox
     * row commit together on the request path, the relay turns that row into a
     * job, and the message is only handed to a driver here — inside the tick,
     * where a provider hanging for ten seconds costs a task's budget rather
     * than a moderator's action.
     */
    id: 'notifications.email',
    event: 'notification.created',
    async handle(payload) {
      /*
       * The payload carries the id and nothing else that matters. Delivery
       * re-reads the notification, the recipient and the preference, because
       * at-least-once delivery means this may run long after the raise — and
       * everything about *whether* to send can have changed in between.
       */
      await deps.notifications!.deliverEmail(payload.notificationId)
    },
  })
}
