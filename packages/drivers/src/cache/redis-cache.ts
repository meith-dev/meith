import { createClient } from 'redis'

import { type CacheDriver, type CacheSetOptions, logger } from '@meith/core'

const DATE_MARK = '\u001fmeith:date'

function encode(value: unknown): string | undefined {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, raw) {
    const original = this[key]
    return original instanceof Date ? { [DATE_MARK]: original.toISOString() } : raw
  })
}

function decode<T>(text: string): T {
  return JSON.parse(text, (_key, raw) => {
    if (
      raw !== null &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      typeof (raw as Record<string, unknown>)[DATE_MARK] === 'string' &&
      Object.keys(raw as object).length === 1
    ) {
      return new Date((raw as Record<string, string>)[DATE_MARK] as string)
    }
    return raw
  }) as T
}

const INVALIDATE_TAG = `
local keys = redis.call('SMEMBERS', KEYS[1])
for i = 1, #keys, 1000 do
  redis.call('DEL', unpack(keys, i, math.min(i + 999, #keys)))
end
redis.call('DEL', KEYS[1])
return #keys
`

export interface RedisCacheOptions {
  readonly url?: string
  readonly socketPath?: string
  readonly keyPrefix?: string
}

type Client = ReturnType<typeof createClient>

export class RedisCacheDriver implements CacheDriver {
  private readonly client: Client
  private readonly prefix: string
  private ready: Promise<unknown> | undefined

  constructor(options: RedisCacheOptions = {}) {
    const log = logger({ driver: 'redis-cache' })
    this.client = createClient(
      options.socketPath !== undefined
        ? { socket: { path: options.socketPath, tls: false } }
        : options.url !== undefined
          ? { url: options.url }
          : {},
    )
    this.client.on('error', (error: unknown) => {
      log.error({ err: error }, 'redis cache connection error')
    })
    this.prefix = options.keyPrefix ?? 'meith:'
  }

  private valueKey(key: string): string {
    return `${this.prefix}v:${key}`
  }

  private tagKey(tag: string): string {
    return `${this.prefix}t:${tag}`
  }

  private async connection(): Promise<Client> {
    this.ready ??= this.client.connect().catch((error: unknown) => {
      this.ready = undefined
      throw error
    })
    await this.ready
    return this.client
  }

  async get<T>(key: string): Promise<T | undefined> {
    const client = await this.connection()
    const stored = await client.get(this.valueKey(key))
    return stored === null ? undefined : decode<T>(stored)
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    const text = encode(value)
    if (text === undefined || (options.ttlSeconds !== undefined && options.ttlSeconds <= 0)) {
      await this.delete(key)
      return
    }

    const client = await this.connection()
    const valueKey = this.valueKey(key)
    const multi = client.multi()
    multi.set(
      valueKey,
      text,
      options.ttlSeconds === undefined
        ? {}
        : { expiration: { type: 'EX', value: Math.ceil(options.ttlSeconds) } },
    )
    for (const tag of options.tags ?? []) {
      multi.sAdd(this.tagKey(tag), valueKey)
    }
    await multi.exec()
  }

  async delete(key: string): Promise<void> {
    const client = await this.connection()
    await client.del(this.valueKey(key))
  }

  async invalidateTags(tags: readonly string[]): Promise<void> {
    if (tags.length === 0) return
    const client = await this.connection()
    await Promise.all(tags.map((tag) => client.eval(INVALIDATE_TAG, { keys: [this.tagKey(tag)] })))
  }

  async close(): Promise<void> {
    if (this.ready === undefined) return
    await this.ready.catch(() => undefined)
    if (this.client.isOpen) await this.client.close()
  }
}
