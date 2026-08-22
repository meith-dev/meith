import postgres from 'postgres'

import { env } from '@meith/core'
import type { DomainEventMap } from '@meith/events'

const CHANNEL = 'meith_thread_events'
const MAX_SUBSCRIBERS = 500

export type ThreadUpdate =
  | { id: number; type: 'post.created'; payload: DomainEventMap['post.created'] }
  | { id: number; type: 'post.edited'; payload: DomainEventMap['post.edited'] }
  | { id: number; type: 'post.deleted'; payload: DomainEventMap['post.deleted'] }
  | {
      id: number
      type: 'post.visibility_changed'
      payload: DomainEventMap['post.visibility_changed']
    }
  | { id: number; type: 'thread.lock_changed'; payload: DomainEventMap['thread.lock_changed'] }

export interface ThreadEventSubscription {
  close(): void
}

export class ThreadEventCapacityError extends Error {}

type Listener = (event: ThreadUpdate) => void

type ListenClient = ReturnType<typeof postgres>

interface HubGlobal {
  __threadEventHub: ThreadEventHub | undefined
}

const globalRef = globalThis as unknown as HubGlobal

export class ThreadEventHub {
  private readonly listeners = new Map<number, Set<Listener>>()
  private client: ListenClient | undefined
  private unlisten: (() => Promise<void>) | undefined
  private subscribers = 0

  constructor(
    private readonly createClient: () => ListenClient,
    private readonly maxSubscribers = MAX_SUBSCRIBERS,
  ) {}

  async subscribe(threadId: number, listener: Listener): Promise<ThreadEventSubscription> {
    if (this.subscribers >= this.maxSubscribers) throw new ThreadEventCapacityError()

    let listeners = this.listeners.get(threadId)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(threadId, listeners)
    }
    listeners.add(listener)
    this.subscribers += 1

    try {
      await this.start()
    } catch (error) {
      this.remove(threadId, listener)
      throw error
    }

    let closed = false
    return {
      close: () => {
        if (closed) return
        closed = true
        this.remove(threadId, listener)
      },
    }
  }

  dispatch(raw: string): void {
    const event = parseThreadUpdate(raw)
    if (!event) return
    for (const listener of this.listeners.get(event.payload.threadId) ?? []) listener(event)
  }

  private async start(): Promise<void> {
    if (this.client) return
    const client = this.createClient()
    this.client = client
    try {
      const listening = await client.listen(CHANNEL, (raw) => this.dispatch(raw))
      this.unlisten = () => listening.unlisten()
    } catch (error) {
      this.client = undefined
      await client.end({ timeout: 5 })
      throw error
    }
  }

  private remove(threadId: number, listener: Listener): void {
    const listeners = this.listeners.get(threadId)
    if (!listeners?.delete(listener)) return
    this.subscribers -= 1
    if (listeners.size === 0) this.listeners.delete(threadId)
    if (this.subscribers === 0) void this.stop()
  }

  private async stop(): Promise<void> {
    const client = this.client
    const unlisten = this.unlisten
    this.client = undefined
    this.unlisten = undefined
    if (unlisten) await unlisten()
    if (client) await client.end({ timeout: 5 })
  }
}

export function getThreadEventHub(): ThreadEventHub | null {
  if (env.DATA_SOURCE !== 'postgres' || !env.DATABASE_URL) return null
  if (globalRef.__threadEventHub) return globalRef.__threadEventHub

  globalRef.__threadEventHub = new ThreadEventHub(() =>
    postgres(env.DATABASE_URL!, {
      max: 1,
      prepare: false,
      idle_timeout: 0,
      max_lifetime: 0,
      connect_timeout: 10,
      onnotice: () => {},
    }),
  )
  return globalRef.__threadEventHub
}

export function parseThreadUpdate(raw: string): ThreadUpdate | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || !isPositiveInteger(value.id) || typeof value.topic !== 'string') return null
  if (!isRecord(value.payload) || !isPositiveInteger(value.payload.threadId)) return null

  const payload = value.payload
  switch (value.topic) {
    case 'post.created':
      if (!isPositiveInteger(payload.postId) || !isPositiveInteger(payload.forumId)) return null
      return { id: value.id, type: value.topic, payload: payload as ThreadUpdate['payload'] }
    case 'post.edited':
      if (!isPositiveInteger(payload.postId)) return null
      return { id: value.id, type: value.topic, payload: payload as ThreadUpdate['payload'] }
    case 'post.deleted':
      if (!isPositiveInteger(payload.postId) || !isPositiveInteger(payload.forumId)) return null
      return { id: value.id, type: value.topic, payload: payload as ThreadUpdate['payload'] }
    case 'post.visibility_changed':
      if (
        !isPositiveInteger(payload.postId) ||
        !isPositiveInteger(payload.forumId) ||
        typeof payload.visible !== 'boolean'
      )
        return null
      return { id: value.id, type: value.topic, payload: payload as ThreadUpdate['payload'] }
    case 'thread.lock_changed':
      if (!isPositiveInteger(payload.forumId) || typeof payload.locked !== 'boolean') return null
      return { id: value.id, type: value.topic, payload: payload as ThreadUpdate['payload'] }
    default:
      return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}
