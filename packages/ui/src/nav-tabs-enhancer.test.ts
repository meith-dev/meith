import type { EffectCallback } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { NavTabsEnhancer } from './nav-tabs-enhancer'

const effects = vi.hoisted(() => ({ mount: (() => {}) as EffectCallback }))

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (mount: EffectCallback) => {
    effects.mount = mount
  },
}))

afterEach(() => vi.unstubAllGlobals())

it('reveals current tabs horizontally, leaves manual scrolling alone, and cleans up observers', () => {
  let offset = 0
  let activeLeft = 240
  let mutate = () => {}
  let resized = () => {}
  const resize = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }
  const changes = { observe: vi.fn(), disconnect: vi.fn() }
  const tab = {
    getBoundingClientRect: () => ({
      left: activeLeft - offset,
      right: activeLeft - offset + 80,
      width: 80,
    }),
  }
  let active: typeof tab | null = tab
  const list = {
    clientWidth: 200,
    isConnected: true,
    getBoundingClientRect: () => ({ left: 0, right: 200 }),
    querySelector: () => active,
    scrollBy: vi.fn((options: ScrollToOptions) => {
      offset += options.left ?? 0
    }),
    closest: () => list,
  }
  vi.stubGlobal('document', { body: {}, querySelectorAll: () => (list.isConnected ? [list] : []) })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = resize.observe
      unobserve = resize.unobserve
      disconnect = resize.disconnect
      constructor(callback: ResizeObserverCallback) {
        resized = () =>
          callback(
            [{ target: list } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          )
      }
    },
  )
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe = changes.observe
      disconnect = changes.disconnect
      constructor(callback: MutationCallback) {
        mutate = () => callback([], this as unknown as MutationObserver)
      }
    },
  )

  NavTabsEnhancer()
  const cleanup = effects.mount()
  expect(offset).toBe(180)
  expect(list.scrollBy).toHaveBeenLastCalledWith({ left: 180 })
  expect(resize.observe).toHaveBeenCalledWith(tab)
  resized()
  expect(list.scrollBy).toHaveBeenCalledTimes(1)

  offset = 0
  mutate()
  expect(offset).toBe(0)
  resized()
  expect(offset).toBe(180)

  active = null
  mutate()
  expect(resize.unobserve).toHaveBeenCalledWith(tab)
  resized()
  expect(list.scrollBy).toHaveBeenCalledTimes(2)
  activeLeft = 10
  active = { ...tab }
  mutate()
  expect(list.scrollBy).toHaveBeenLastCalledWith({ left: -230 })

  list.clientWidth = 0
  resized()
  expect(list.scrollBy).toHaveBeenCalledTimes(3)
  list.isConnected = false
  mutate()
  expect(resize.unobserve).toHaveBeenCalledWith(list)
  if (cleanup) cleanup()
  expect(resize.disconnect).toHaveBeenCalledOnce()
  expect(changes.disconnect).toHaveBeenCalledOnce()
})
