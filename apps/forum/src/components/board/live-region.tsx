'use client'

/**
 * The island that keeps the index sidebar's two panels current.
 *
 * It holds no markup of its own beyond one status line. What it renders is what
 * the server handed it — the theme's `LatestThreads` and `LatestPosts`, already
 * rendered — and what it fetches is the *same two slots rendered again* by a
 * Server Action. So the theme owns every pixel that changes, the app owns only
 * *when* it changes, and neither slot has to become a client component to move.
 *
 * ## It enhances; it does not enable
 *
 * With scripting off, `children` is the whole component: two panels, correct as
 * of the page load, with no controls and no dead buttons. That is why the
 * status line waits for `enhanced` before it appears — a paused/resume control
 * rendered into a page that cannot run its handler is a lie in the interface,
 * and the pattern is the one `markdown-editor.tsx` already uses.
 *
 * ## Four reasons a tick is skipped, and each of them is somebody
 *
 *  - **Paused.** Content that starts updating on its own has to be stoppable —
 *    WCAG 2.2.2, and more plainly: somebody reading the fifth row should not
 *    have it replaced mid-sentence. The control is the point of the status line;
 *    the line's text is what makes the control's purpose obvious.
 *  - **The tab is hidden.** A backgrounded tab is nobody reading. Skipping the
 *    tick there is what makes a tab left open overnight cost the board nothing,
 *    and returning to it refreshes immediately rather than up to a minute late.
 *  - **Focus is inside the region.** Swapping the tree while somebody is tabbing
 *    through it moves the link under their cursor. React reuses the DOM where
 *    the shape matches, but a new post at the top *is* a shape change, and the
 *    one moment it happens is the moment somebody is reading the list.
 *  - **The action failed.** The panel keeps what it has and tries again next
 *    tick. A sidebar is the least important thing on the page it is on; an
 *    error message where five thread titles were is worse than a minute-old
 *    list.
 *
 * There is deliberately **no `aria-live`**. Announcing five thread titles a
 * minute into somebody's screen reader while they read the board is not an
 * accessibility feature, it is an interruption; the pause control is what the
 * guideline actually asks for, and the panels are ordinary content a reader
 * navigates to when they want it.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface LiveRegionProps {
  /** The server's render: what shows before, and instead of, any refresh. */
  readonly children: ReactNode
  /** The Server Action that re-renders the region. */
  readonly refresh: () => Promise<ReactNode>
  readonly seconds: number
  /** What the status line calls this region, in a sentence. */
  readonly label: string
}

export function LiveRegion({ children, refresh, seconds, label }: LiveRegionProps) {
  const region = useRef<HTMLDivElement>(null)
  const [fresh, setFresh] = useState<ReactNode>(null)
  const [enhanced, setEnhanced] = useState(false)
  const [paused, setPaused] = useState(false)

  /*
   * A Server Action reference is a prop, and a prop is not a stable identity to
   * hang an effect on. Keeping it in a ref means the poll loop is rebuilt when
   * the *schedule* changes and never merely because the page re-rendered.
   */
  const action = useRef(refresh)
  action.current = refresh

  useEffect(() => setEnhanced(true), [])

  /*
   * A newer server render supersedes whatever this island last fetched. Without
   * this, a navigation back to the index — or any re-render of the page around
   * it — would show the older of the two, because state outlives props.
   */
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
        .catch(() => {
          /* Deliberately swallowed. See this file's header. */
        })
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
      {/*
        `display: contents` — the wrapper exists only to give the poll loop
        something to ask about focus. A real box here would become a flex item
        in whatever the theme laid the region out as, and the panels inside it
        would stop being ones.
      */}
      <div ref={region} className="contents">
        {fresh ?? children}
      </div>

      {enhanced && (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
          <span>
            {paused ? `${label} paused` : `${label} updates every ${seconds} seconds`}
          </span>
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
