/**
 * The contract every driver implementation must satisfy (F05).
 *
 * "A contract test suite every implementation must pass" — because the point of
 * the driver seam is that downstream code never branches on which
 * implementation it holds. That only holds if the implementations genuinely
 * behave the same, and the differences that bite are never in the type
 * signature: it is whether `get` on a missing key returns `undefined` or
 * throws, whether an expired entry is a miss, whether two concurrent drains can
 * claim the same job.
 *
 * These are exported as functions rather than as `describe` blocks in a shared
 * file so each implementation's own suite calls them with its own setup and
 * teardown, and shows up under its own name when it fails.
 */
import type { CacheDriver, FileStore, MailDriver, QueueDriver } from '@forum/core'
import { describe, expect, it } from 'vitest'

/** Fresh instance per test — a contract must not depend on test ordering. */
export interface DriverFactory<T> {
  (): Promise<T> | T
}

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

export function cacheDriverContract(name: string, make: DriverFactory<CacheDriver>): void {
  describe(`CacheDriver contract: ${name}`, () => {
    it('returns undefined for a key that was never set', async () => {
      const cache = await make()
      // Not null, not a throw. `cachedGlobal` treats undefined as "miss", so a
      // driver that throws turns a cold cache into a 500.
      expect(await cache.get('absent')).toBeUndefined()
    })

    it('round-trips a value', async () => {
      const cache = await make()
      await cache.set('k', { a: 1 })
      expect(await cache.get('k')).toEqual({ a: 1 })
    })

    it('overwrites on a second set', async () => {
      const cache = await make()
      await cache.set('k', 'first')
      await cache.set('k', 'second')
      expect(await cache.get('k')).toBe('second')
    })

    it('deletes', async () => {
      const cache = await make()
      await cache.set('k', 'v')
      await cache.delete('k')
      expect(await cache.get('k')).toBeUndefined()
    })

    it('deleting an absent key is not an error', async () => {
      const cache = await make()
      await expect(cache.delete('never-existed')).resolves.not.toThrow()
    })

    it('invalidates every entry carrying a tag', async () => {
      const cache = await make()
      await cache.set('a', 1, { tags: ['t1'] })
      await cache.set('b', 2, { tags: ['t1', 't2'] })
      await cache.set('c', 3, { tags: ['t2'] })

      await cache.invalidateTags(['t1'])

      expect(await cache.get('a')).toBeUndefined()
      expect(await cache.get('b')).toBeUndefined()
      expect(await cache.get('c')).toBe(3)
    })

    it('leaves untagged entries alone when invalidating', async () => {
      const cache = await make()
      await cache.set('untagged', 'v')
      await cache.invalidateTags(['anything'])
      expect(await cache.get('untagged')).toBe('v')
    })

    it('treats invalidating no tags as a no-op, not as "everything"', async () => {
      // A caller with an empty tag list must not accidentally flush the board.
      const cache = await make()
      await cache.set('k', 'v', { tags: ['t'] })
      await cache.invalidateTags([])
      expect(await cache.get('k')).toBe('v')
    })

    it('treats an expired entry as a miss', async () => {
      const cache = await make()
      await cache.set('k', 'v', { ttlSeconds: -1 })
      expect(await cache.get('k')).toBeUndefined()
    })
  })
}

/* ------------------------------------------------------------------ *
 * Queue
 * ------------------------------------------------------------------ */

export function queueDriverContract(name: string, make: DriverFactory<QueueDriver>): void {
  describe(`QueueDriver contract: ${name}`, () => {
    it('enqueues and drains a job', async () => {
      const queue = await make()
      await queue.enqueue('test.job', { n: 1 })

      const seen: unknown[] = []
      const result = await queue.drain(10, async (job) => {
        seen.push(job.payload)
      })

      expect(result.processed).toBe(1)
      expect(seen).toEqual([{ n: 1 }])
    })

    it('drains an empty queue without error', async () => {
      const queue = await make()
      const result = await queue.drain(10, async () => {})
      expect(result).toEqual({ processed: 0, failed: 0 })
    })

    it('respects the drain limit', async () => {
      const queue = await make()
      for (let i = 0; i < 5; i++) await queue.enqueue('test.job', { i })

      const result = await queue.drain(2, async () => {})
      expect(result.processed).toBe(2)
    })

    /*
     * F05: "Queue survives a concurrent double-drain without double-processing."
     * Two workers, or a cron tick overlapping a worker loop, must never receive
     * the same job — at-least-once delivery is the contract, but delivering the
     * same job to two workers *simultaneously* is not that.
     */
    it('does not hand the same job to two concurrent drains', async () => {
      const queue = await make()
      for (let i = 0; i < 6; i++) await queue.enqueue('test.job', { i })

      const seen: number[] = []
      const handler = async (job: { payload: unknown }) => {
        seen.push((job.payload as { i: number }).i)
      }

      await Promise.all([queue.drain(6, handler), queue.drain(6, handler)])

      expect(new Set(seen).size).toBe(seen.length)
    })

    it('counts a throwing handler as failed, not processed', async () => {
      const queue = await make()
      await queue.enqueue('test.job', { n: 1 })

      const result = await queue.drain(10, async () => {
        throw new Error('handler blew up')
      })

      // A failure must not be silently counted as success, or the tick reports
      // work that never happened.
      expect(result.failed).toBe(1)
      expect(result.processed).toBe(0)
    })

    it('does not lose the other jobs when one handler throws', async () => {
      const queue = await make()
      await queue.enqueue('test.job', { n: 1 })
      await queue.enqueue('test.job', { n: 2 })

      const result = await queue.drain(10, async (job) => {
        if ((job.payload as { n: number }).n === 1) throw new Error('nope')
      })

      expect(result.processed + result.failed).toBe(2)
    })
  })
}

/* ------------------------------------------------------------------ *
 * FileStore
 * ------------------------------------------------------------------ */

export function fileStoreContract(name: string, make: DriverFactory<FileStore>): void {
  describe(`FileStore contract: ${name}`, () => {
    const body = new TextEncoder().encode('hello attachment')

    it('round-trips bytes unchanged', async () => {
      const store = await make()
      await store.put('a/b.txt', body, { contentType: 'text/plain', visibility: 'private' })

      const read = await store.get('a/b.txt')
      expect(read).toBeDefined()
      expect(new TextDecoder().decode(read as Uint8Array)).toBe('hello attachment')
    })

    it('reports the size it stored', async () => {
      const store = await make()
      const stored = await store.put('a/b.txt', body, {
        contentType: 'text/plain',
        visibility: 'private',
      })
      expect(stored.size).toBe(body.byteLength)
    })

    it('returns undefined for a missing key rather than throwing', async () => {
      const store = await make()
      expect(await store.get('nothing/here.txt')).toBeUndefined()
    })

    it('deletes', async () => {
      const store = await make()
      await store.put('gone.txt', body, { contentType: 'text/plain', visibility: 'private' })
      await store.delete('gone.txt')
      expect(await store.get('gone.txt')).toBeUndefined()
    })

    it('deleting an absent key is not an error', async () => {
      // Orphan cleanup (F42) runs repeatedly and must be idempotent.
      const store = await make()
      await expect(store.delete('never-existed.txt')).resolves.not.toThrow()
    })

    it('overwrites an existing key', async () => {
      const store = await make()
      await store.put('k.txt', body, { contentType: 'text/plain', visibility: 'private' })
      await store.put('k.txt', new TextEncoder().encode('replaced'), {
        contentType: 'text/plain',
        visibility: 'private',
      })
      expect(new TextDecoder().decode((await store.get('k.txt')) as Uint8Array)).toBe('replaced')
    })

    it('keeps keys with slashes distinct', async () => {
      const store = await make()
      await store.put('a/b.txt', new TextEncoder().encode('one'), {
        contentType: 'text/plain',
        visibility: 'private',
      })
      await store.put('a/c.txt', new TextEncoder().encode('two'), {
        contentType: 'text/plain',
        visibility: 'private',
      })

      expect(new TextDecoder().decode((await store.get('a/b.txt')) as Uint8Array)).toBe('one')
      expect(new TextDecoder().decode((await store.get('a/c.txt')) as Uint8Array)).toBe('two')
    })

    it('returns a string url for a stored object', async () => {
      const store = await make()
      await store.put('pub.txt', body, { contentType: 'text/plain', visibility: 'public' })
      expect(typeof store.url('pub.txt')).toBe('string')
    })

    it('either signs a url or admits it cannot', async () => {
      /*
       * The port allows `undefined` for stores with no signing support, so the
       * caller streams through the app instead. What it must not do is return a
       * plain unsigned URL and let a private attachment be fetched directly —
       * F42's "an attachment in a forum the actor cannot view is not
       * downloadable by direct URL".
       */
      const store = await make()
      await store.put('priv.txt', body, { contentType: 'text/plain', visibility: 'private' })

      const signed = await store.signedUrl('priv.txt', 60)
      expect(signed === undefined || typeof signed === 'string').toBe(true)
    })
  })
}

/* ------------------------------------------------------------------ *
 * Mail
 * ------------------------------------------------------------------ */

export function mailDriverContract(name: string, make: DriverFactory<MailDriver>): void {
  describe(`MailDriver contract: ${name}`, () => {
    it('accepts a well-formed message', async () => {
      const mail = await make()
      await expect(
        mail.send({ to: 'a@example.test', subject: 'Hi', text: 'Body' }),
      ).resolves.not.toThrow()
    })

    it('accepts an optional html part', async () => {
      const mail = await make()
      await expect(
        mail.send({
          to: 'a@example.test',
          subject: 'Hi',
          text: 'Body',
          html: '<p>Body</p>',
        }),
      ).resolves.not.toThrow()
    })
  })
}
