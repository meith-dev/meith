/**
 * F07 — handler registry.
 *
 * A plain map rather than a decorator/DI framework: handlers must be enumerable
 * at build time so the relay can compute the exact set of jobs for an event, and
 * so a missing registration is a visible absence rather than a silent no-op.
 */

import type { DomainEventMap, DomainEventName, EventHandler } from './types'

export class EventRegistry {
  private readonly byEvent = new Map<DomainEventName, EventHandler[]>()
  private readonly byId = new Map<string, EventHandler>()

  register<N extends DomainEventName>(handler: EventHandler<N>): this {
    /*
     * Handler ids are baked into queue idempotency keys, so a collision would
     * make two different handlers share a dedupe identity and one would be
     * silently dropped. Fail loudly at registration instead.
     */
    if (this.byId.has(handler.id)) {
      throw new Error(
        `Duplicate event handler id "${handler.id}". Ids are used as queue ` +
          `idempotency keys and must be unique across the whole application.`,
      )
    }

    this.byId.set(handler.id, handler as EventHandler)

    const list = this.byEvent.get(handler.event) ?? []
    list.push(handler as EventHandler)
    this.byEvent.set(handler.event, list)

    return this
  }

  handlerIdsFor(event: DomainEventName): readonly string[] {
    return (this.byEvent.get(event) ?? []).map((h) => h.id)
  }

  get(id: string): EventHandler | undefined {
    return this.byId.get(id)
  }

  /**
   * Runs one handler against a payload. Called by the worker when a relayed job
   * is dequeued; the queue's own retry/backoff handles failure.
   */
  async dispatch(handlerId: string, payload: unknown): Promise<void> {
    const handler = this.byId.get(handlerId)

    if (!handler) {
      /*
       * Reachable in a normal rolling deploy: a job enqueued by the previous
       * version names a handler this build removed. Throwing would retry
       * forever, so treat it as a no-op and let the caller log it.
       */
      return
    }

    await handler.handle(payload as DomainEventMap[DomainEventName])
  }

  /** All registered ids, for the operator CLI and startup diagnostics. */
  ids(): readonly string[] {
    return [...this.byId.keys()]
  }
}

export const eventRegistry = new EventRegistry()
