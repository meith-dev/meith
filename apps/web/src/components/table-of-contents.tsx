'use client'

import { useEffect, useMemo, useState } from 'react'

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
        const first = headings.find((heading) => visible.has(heading.id))
        if (first) setActiveId(first.id)
      },
      { rootMargin: '-96px 0px -67% 0px', threshold: 0 },
    )

    for (const element of elements) observer.observe(element)
    return () => observer.disconnect()
  }, [headings])

  const shown = useMemo(() => {
    const hasSections = headings.some((heading) => heading.depth === 2)
    if (!hasSections) return headings

    let openSection: string | null = null
    let currentSection: string | null = null
    for (const heading of headings) {
      if (heading.depth === 2) currentSection = heading.id
      if (heading.id === activeId) {
        openSection = currentSection
        break
      }
    }

    const result: TocHeading[] = []
    let section: string | null = null
    for (const heading of headings) {
      if (heading.depth === 2) {
        section = heading.id
        result.push(heading)
      } else if (section === openSection) {
        result.push(heading)
      }
    }
    return result
  }, [headings, activeId])

  if (headings.length === 0) return null

  return (
    <nav aria-label="On this page" className="flex flex-col gap-2">
      <p className="eyebrow">On this page</p>
      <ul className="flex flex-col gap-0.5 border-l border-border">
        {shown.map((heading) => {
          const active = heading.id === activeId
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={active ? 'location' : undefined}
                className={`-ml-px block border-l py-1 text-micro leading-snug transition-colors ${
                  heading.depth === 3 ? 'pl-6' : 'pl-3'
                } ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-fg-subtle hover:border-border-strong hover:text-fg'
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
