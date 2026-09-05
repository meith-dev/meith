'use client'

import { type ReactNode, useEffect, useRef } from 'react'

export function MobileMenu({ children }: { readonly children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false
        details.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <details className="mobile-menu md:hidden" ref={details}>
      <summary aria-label="Menu" className="mobile-menu-button">
        <span aria-hidden className="mobile-menu-bars">
          <span />
          <span />
          <span />
        </span>
      </summary>
      <div
        className="mobile-menu-panel"
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest('a') && details.current) {
            details.current.open = false
          }
        }}
      >
        {children}
      </div>
    </details>
  )
}
