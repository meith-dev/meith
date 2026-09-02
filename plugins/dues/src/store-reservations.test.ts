import { describe, expect, it } from 'vitest'

import type { PluginData } from '@meith/plugin-kit'

import { consumeCodeReservation, releaseCodeReservation, reserveCodeRedemption } from './store'

interface CodeState {
  maxRedemptions: number | null
  redeemedCount: number
}

type ReservationStatus = 'held' | 'consumed' | 'released'

interface Reservation {
  codeId: number
  status: ReservationStatus
}

function fakeData(codes: Map<number, CodeState>) {
  const reservations = new Map<number, Reservation>()
  let lock: Promise<unknown> = Promise.resolve()

  const run = (raw: string, params: readonly unknown[]): Record<string, unknown>[] => {
    const text = raw.replace(/\s+/g, ' ').trim()

    if (text.includes('from plugin_dues_code where id = $1 for update')) {
      const code = codes.get(Number(params[0]))
      return code === undefined ? [] : [{ max_redemptions: code.maxRedemptions }]
    }

    if (text.startsWith('select status from plugin_dues_code_reservation where order_id = $1')) {
      const found = reservations.get(Number(params[0]))
      return found === undefined ? [] : [{ status: found.status }]
    }

    if (text.startsWith('select id from plugin_dues_code_reservation where order_id = $1')) {
      const orderId = Number(params[0])
      return reservations.has(orderId) ? [{ id: orderId }] : []
    }

    if (text.includes('count(*)') && text.includes('plugin_dues_code_reservation')) {
      const codeId = Number(params[0])
      let taken = 0
      for (const reservation of reservations.values()) {
        if (
          reservation.codeId === codeId &&
          (reservation.status === 'held' || reservation.status === 'consumed')
        ) {
          taken += 1
        }
      }
      return [{ taken }]
    }

    if (text.startsWith("update plugin_dues_code_reservation set status = 'consumed'")) {
      const found = reservations.get(Number(params[0]))
      if (found !== undefined && found.status === 'held') {
        found.status = 'consumed'
        return [{ code_id: found.codeId }]
      }
      return []
    }

    if (text.startsWith("update plugin_dues_code_reservation set status = 'released'")) {
      const found = reservations.get(Number(params[0]))
      if (found !== undefined && found.status === 'held') found.status = 'released'
      return []
    }

    if (text.startsWith('insert into plugin_dues_code_reservation')) {
      const codeId = Number(params[0])
      const orderId = Number(params[1])
      if (reservations.has(orderId)) return []
      reservations.set(orderId, {
        codeId,
        status: text.includes("'consumed'") ? 'consumed' : 'held',
      })
      return text.includes('returning id') ? [{ id: orderId }] : []
    }

    if (text.startsWith('update plugin_dues_code set redeemed_count = redeemed_count + 1')) {
      const code = codes.get(Number(params[0]))
      if (code !== undefined) code.redeemedCount += 1
      return []
    }

    throw new Error(`fake data: unhandled statement: ${text}`)
  }

  const data: PluginData = {
    async query(text, params = []) {
      return run(text, params) as never
    },
    async one(text, params = []) {
      return (run(text, params)[0] ?? null) as never
    },
    async tx(work) {
      const result = lock.then(() => work(data))
      lock = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }

  const activeCount = (codeId: number): number => {
    let taken = 0
    for (const reservation of reservations.values()) {
      if (
        reservation.codeId === codeId &&
        (reservation.status === 'held' || reservation.status === 'consumed')
      ) {
        taken += 1
      }
    }
    return taken
  }

  return { data, reservations, activeCount }
}

describe('reserveCodeRedemption', () => {
  it('holds a slot up to the cap and refuses the one past it', async () => {
    const codes = new Map([[1, { maxRedemptions: 2, redeemedCount: 0 }]])
    const { data, activeCount } = fakeData(codes)

    expect(await reserveCodeRedemption(data, 1, 101)).toBe(true)
    expect(await reserveCodeRedemption(data, 1, 102)).toBe(true)
    expect(await reserveCodeRedemption(data, 1, 103)).toBe(false)

    expect(activeCount(1)).toBe(2)
  })

  it('lets an unlimited code reserve freely', async () => {
    const codes = new Map([[1, { maxRedemptions: null, redeemedCount: 0 }]])
    const { data, activeCount } = fakeData(codes)

    for (let orderId = 1; orderId <= 10; orderId += 1) {
      expect(await reserveCodeRedemption(data, 1, orderId)).toBe(true)
    }
    expect(activeCount(1)).toBe(10)
  })

  it('re-reserving the same order keeps its one slot', async () => {
    const codes = new Map([[1, { maxRedemptions: 1, redeemedCount: 0 }]])
    const { data, activeCount } = fakeData(codes)

    expect(await reserveCodeRedemption(data, 1, 101)).toBe(true)
    expect(await reserveCodeRedemption(data, 1, 101)).toBe(true)

    expect(activeCount(1)).toBe(1)
  })

  it('refuses a code that does not exist', async () => {
    const { data } = fakeData(new Map())
    expect(await reserveCodeRedemption(data, 999, 1)).toBe(false)
  })

  it('never oversells under parallel checkouts', async () => {
    const codes = new Map([[1, { maxRedemptions: 1, redeemedCount: 0 }]])
    const { data, activeCount } = fakeData(codes)

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => reserveCodeRedemption(data, 1, 200 + index)),
    )

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(activeCount(1)).toBe(1)
  })

  it('never oversells a small cap under a parallel rush', async () => {
    const codes = new Map([[1, { maxRedemptions: 3, redeemedCount: 0 }]])
    const { data, activeCount } = fakeData(codes)

    const results = await Promise.all(
      Array.from({ length: 25 }, (_, index) => reserveCodeRedemption(data, 1, 300 + index)),
    )

    expect(results.filter(Boolean)).toHaveLength(3)
    expect(activeCount(1)).toBe(3)
  })
})

describe('consumeCodeReservation', () => {
  it('consumes a held slot and counts the redemption once', async () => {
    const codes = new Map([[1, { maxRedemptions: 2, redeemedCount: 0 }]])
    const { data, reservations } = fakeData(codes)

    await reserveCodeRedemption(data, 1, 101)
    await consumeCodeReservation(data, 101, 1)

    expect(reservations.get(101)?.status).toBe('consumed')
    expect(codes.get(1)?.redeemedCount).toBe(1)

    await consumeCodeReservation(data, 101, 1)
    expect(codes.get(1)?.redeemedCount).toBe(1)
  })

  it('records and counts a legacy order that never reserved', async () => {
    const codes = new Map([[1, { maxRedemptions: 5, redeemedCount: 0 }]])
    const { data, reservations, activeCount } = fakeData(codes)

    await consumeCodeReservation(data, 101, 1)

    expect(reservations.get(101)?.status).toBe('consumed')
    expect(codes.get(1)?.redeemedCount).toBe(1)
    expect(activeCount(1)).toBe(1)

    await consumeCodeReservation(data, 101, 1)
    expect(codes.get(1)?.redeemedCount).toBe(1)
  })
})

describe('releaseCodeReservation', () => {
  it('frees a held slot so another checkout can take it', async () => {
    const codes = new Map([[1, { maxRedemptions: 1, redeemedCount: 0 }]])
    const { data, activeCount } = fakeData(codes)

    expect(await reserveCodeRedemption(data, 1, 101)).toBe(true)
    expect(await reserveCodeRedemption(data, 1, 102)).toBe(false)

    await releaseCodeReservation(data, 101)
    expect(activeCount(1)).toBe(0)

    expect(await reserveCodeRedemption(data, 1, 102)).toBe(true)
    expect(codes.get(1)?.redeemedCount).toBe(0)
  })

  it('never releases a slot that was already consumed', async () => {
    const codes = new Map([[1, { maxRedemptions: 1, redeemedCount: 0 }]])
    const { data, reservations, activeCount } = fakeData(codes)

    await reserveCodeRedemption(data, 1, 101)
    await consumeCodeReservation(data, 101, 1)

    await releaseCodeReservation(data, 101)

    expect(reservations.get(101)?.status).toBe('consumed')
    expect(activeCount(1)).toBe(1)
  })
})
