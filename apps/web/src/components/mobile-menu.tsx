'use client'

import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useRef } from 'react'

export function MobileMenu({ children }: { readonly children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()

  // biome-ignore lint/correctness/useExhaustiveDependencies: the menu closes on every route change, which pathname carries
  useEffect(() => {
    if (details.current) details.current.open = false
  }, [pathname])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false
        details.current.querySelector('summary')?.focus()
      }
    }

    function onPointer(event: PointerEvent) {
      if (
        details.current?.open &&
        event.target instanceof Node &&
        !details.current.contains(event.target)
      ) {
        details.current.open = false
      }
    }

    const desktop = window.matchMedia('(min-width: 1100px)')
    function onViewport() {
      if (desktop.matches && details.current) details.current.open = false
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    desktop.addEventListener('change', onViewport)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      desktop.removeEventListener('change', onViewport)
    }
  }, [])

  return (
    <details className="site-mobile-menu" ref={details}>
      <summary aria-label="Navigation menu" className="site-menu-button">
        <span aria-hidden className="site-menu-bars">
          <span />
          <span />
        </span>
      </summary>
      <div
        className="site-menu-panel"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest('a') && details.current) {
            const menu = details.current
            requestAnimationFrame(() => {
              menu.open = false
            })
          }
        }}
      >
        {children}
      </div>
    </details>
  )
}
