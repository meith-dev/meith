import type { DomainEventMap, DomainEventName, EventHandler } from './types'

export class EventRegistry {
  private readonly byEvent = new Map<DomainEventName, EventHandler[]>()
  private readonly byId = new Map<string, EventHandler>()

  register<N extends DomainEventName>(handler: EventHandler<N>): this {
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

  async dispatch(handlerId: string, payload: unknown, signal?: AbortSignal): Promise<void> {
    const handler = this.byId.get(handlerId)

    if (!handler) {
      console.warn(
        `no handler registered for dispatched event "${handlerId}"; job will be marked done ` +
          'with no work performed',
      )
      return
    }

    await handler.handle(payload as DomainEventMap[DomainEventName], signal)
  }

  ids(): readonly string[] {
    return [...this.byId.keys()]
  }
}
