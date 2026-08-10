export type {
  DomainEvent,
  DomainEventMap,
  DomainEventName,
  EventHandler,
  OutboxRecord,
} from './types'

export {
  emit,
  relayOutbox,
  type OutboxWriter,
  type OutboxReader,
  type RelayTarget,
  type RelayDeps,
  type RelayResult,
} from './outbox'

export { EventRegistry, eventRegistry } from './registry'
