"use client"

/**
 * The contents rail, with the section you are reading marked.
 *
 * `IntersectionObserver` rather than a scroll handler: it does not run on every
 * frame of a scroll, and the rail is a hint rather than a measurement, so the
 * observer's coarser granularity costs nothing a reader would notice.
 *
 * The observed band is the top third of the viewport. A heading counts as "the
 * one you are reading" once it has passed under the header and before it leaves
 * the top of the screen — the alternative, marking whatever is centred, marks
 * the *next* section while you are still finishing the current one.
 */

import { useEffect, useState } from "react"

export interface TocHeading {
  readonly id: string
  readonly text: string
  readonly depth: number
}

interface TableOfContentsProps {
  readonly headings: readonly TocHeading[]
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (headings.length === 0) return

    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null)

    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        /* Document order, so the *first* heading in the band wins. */
        const first = headings.find((heading) => visible.has(heading.id))
        if (first) setActiveId(first.id)
      },
      /*
       * Pixels, not `rem`. `IntersectionObserver` accepts only px and %, and
       * throws a SyntaxError on anything else — which, thrown from an effect
       * during hydration, takes the whole page down rather than merely
       * disabling the rail. 96px is the 6rem of `scroll-padding-top` in
       * `globals.css`, so the band starts exactly where an anchor jump lands.
       */
      { rootMargin: "-96px 0px -67% 0px", threshold: 0 },
    )

    for (const element of elements) observer.observe(element)
    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav aria-label="On this page" className="flex flex-col gap-2">
      <p className="eyebrow">On this page</p>
      <ul className="flex flex-col gap-0.5 border-l border-wall">
        {headings.map((heading) => {
          const active = heading.id === activeId
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={active ? "location" : undefined}
                className={`-ml-px block border-l py-1 text-micro leading-snug transition-colors ${
                  heading.depth === 3 ? "pl-6" : "pl-3"
                } ${
                  active
                    ? "border-gorse text-gorse"
                    : "border-transparent text-ink-faint hover:border-lichen hover:text-ink"
                }`}
              >
                {heading.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
