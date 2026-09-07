import { afterEach, expect, it, vi } from 'vitest'

import { unavailablePluginData } from '@meith/plugin-kit'

import { cachedAwards, clearDisplay } from './display-cache'

afterEach(() => {
  clearDisplay()
  vi.useRealTimers()
})

it('shares in-flight work for an author, expires at 60 seconds and invalidates locally', async () => {
  vi.useFakeTimers()
  const query = vi.fn(async () => [])
  const data = { ...unavailablePluginData('test'), query }
  await Promise.all([cachedAwards(data, 1, 5), cachedAwards(data, 1, 5)])
  expect(query).toHaveBeenCalledTimes(1)
  expect(query.mock.calls[0]).toEqual([expect.stringContaining('g.user_id = $1'), [1, 6]])
  vi.advanceTimersByTime(60_000)
  await cachedAwards(data, 1, 5)
  clearDisplay(1)
  await cachedAwards(data, 1, 5)
  await cachedAwards(data, 1, 2)
  expect(query).toHaveBeenCalledTimes(4)
})

it('bounds entries at 2,000 and never caches a failure', async () => {
  const query = vi.fn(async () => [])
  const data = { ...unavailablePluginData('test'), query }
  for (let id = 1; id <= 2001; id++) await cachedAwards(data, id, 5)
  await cachedAwards(data, 1, 5)
  expect(query).toHaveBeenCalledTimes(2002)
  const broken = {
    ...data,
    query: vi.fn(async (): Promise<never> => {
      throw new Error('offline')
    }),
  }
  await expect(cachedAwards(broken, 3000, 5)).rejects.toThrow('offline')
  await cachedAwards(data, 3000, 5)
  expect(query).toHaveBeenCalledTimes(2003)
})

it('invalidates across separate route module instances', async () => {
  const query = vi.fn(async () => [])
  const data = { ...unavailablePluginData('test'), query }
  await cachedAwards(data, 4, 5)
  vi.resetModules()
  const otherRoute = await import('./display-cache')
  otherRoute.clearDisplay(4)
  await cachedAwards(data, 4, 5)
  expect(query).toHaveBeenCalledTimes(2)
})
