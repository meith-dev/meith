'use client'

import { useEffect } from 'react'

const OPEN_DISCLOSURES = '[data-nav-disclosure][open]'

export function NavDisclosureEnhancer() {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return

      for (const details of document.querySelectorAll<HTMLDetailsElement>(OPEN_DISCLOSURES)) {
        if (!details.contains(target)) details.open = false
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      for (const details of document.querySelectorAll<HTMLDetailsElement>(OPEN_DISCLOSURES)) {
        details.open = false
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return null
}
