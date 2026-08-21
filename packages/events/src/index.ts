export {
  emit,
  type OutboxReader,
  type OutboxWriter,
  type RelayDeps,
  type RelayResult,
  type RelayTarget,
  relayOutbox,
} from './outbox'
export { EventRegistry } from './registry'
export type {
  DomainEvent,
  DomainEventMap,
  DomainEventName,
  EventHandler,
  OutboxRecord,
} from './types'
