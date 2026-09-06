'use client'

import { useEffect } from 'react'

const SELECTOR = '[data-nav-tabs]'
const CURRENT = '[aria-current]:not([aria-current="false"])'

function reveal(list: HTMLElement, active: HTMLElement | null) {
  if (active === null || list.clientWidth === 0) return
  const bounds = list.getBoundingClientRect()
  const tab = active.getBoundingClientRect()
  if (tab.left >= bounds.left + 4 && tab.right <= bounds.right - 4) return
  list.scrollBy({ left: tab.left - bounds.left - (list.clientWidth - tab.width) / 2 })
}

export function NavTabsEnhancer() {
  useEffect(() => {
    const lists = new Map<HTMLElement, HTMLElement | null>()
    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const list = entry.target.closest<HTMLElement>(SELECTOR)
        if (list === null) continue
        reveal(list, lists.get(list) ?? null)
      }
    })

    function refresh() {
      for (const list of lists.keys()) {
        if (list.isConnected) continue
        resize.unobserve(list)
        const active = lists.get(list)
        if (active) resize.unobserve(active)
        lists.delete(list)
      }
      for (const list of document.querySelectorAll<HTMLElement>(SELECTOR)) {
        const active = list.querySelector<HTMLElement>(CURRENT)
        if (!lists.has(list)) resize.observe(list)
        if (lists.get(list) !== active) {
          const previous = lists.get(list)
          if (previous) resize.unobserve(previous)
          if (active) resize.observe(active)
          reveal(list, active)
        }
        lists.set(list, active)
      }
    }

    const changes = new MutationObserver(refresh)
    changes.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-current'],
    })
    refresh()

    return () => {
      changes.disconnect()
      resize.disconnect()
    }
  }, [])

  return null
}
