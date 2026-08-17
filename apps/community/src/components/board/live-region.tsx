'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

export interface LiveRegionProps {
  readonly children: ReactNode
  readonly refresh: () => Promise<ReactNode>
  readonly seconds: number
  readonly label: string
}

export function LiveRegion({ children, refresh, seconds, label }: LiveRegionProps) {
  const region = useRef<HTMLDivElement>(null)
  const [fresh, setFresh] = useState<ReactNode>(null)
  const [enhanced, setEnhanced] = useState(false)
  const [paused, setPaused] = useState(false)

  const action = useRef(refresh)
  action.current = refresh

  useEffect(() => setEnhanced(true), [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: children is the reset trigger — a new server render clears the stale client copy
  useEffect(() => setFresh(null), [children])

  useEffect(() => {
    if (paused) return

    let live = true

    const poll = (): void => {
      if (document.hidden) return
      if (region.current?.contains(document.activeElement)) return

      void action
        .current()
        .then((node) => {
          if (live) setFresh(node)
        })
        .catch(() => {})
    }

    const timer = window.setInterval(poll, seconds * 1000)
    const onVisibility = (): void => poll()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      live = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [paused, seconds])

  return (
    <>
      <div ref={region} className="contents">
        {fresh ?? children}
      </div>

      {enhanced && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>{paused ? `${label} paused` : `${label} updates every ${seconds} seconds`}</span>
          <button
            type="button"
            onClick={() => setPaused((was) => !was)}
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </p>
      )}
    </>
  )
}
