'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface SearchEntry {
  readonly href: string
  readonly document: string
  readonly section: string
  readonly heading: string
  readonly depth: number
  readonly snippet: string
  readonly haystack: string
}

const MAX_RESULTS = 24

function score(entry: SearchEntry, terms: readonly string[]): number {
  const heading = entry.heading.toLowerCase()
  const title = entry.document.toLowerCase()

  let total = 0
  for (const term of terms) {
    if (!entry.haystack.includes(term)) return -1
    if (heading.startsWith(term)) total += 6
    else if (heading.includes(term)) total += 4
    else if (title.includes(term)) total += 2
    else total += 1
  }
  return total - entry.depth * 0.1
}

export function DocsSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<readonly SearchEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (entries || failed) return
    try {
      const response = await fetch('/docs/search-index.json')
      if (!response.ok) throw new Error(`search index: ${response.status}`)
      const index: { entries: SearchEntry[] } = await response.json()
      setEntries(index.entries)
    } catch {
      setFailed(true)
    }
  }, [entries, failed])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((wasOpen) => !wasOpen)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
    inputRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open, load])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!entries || terms.length === 0) return []

    return entries
      .map((entry) => ({ entry, rank: score(entry, terms) }))
      .filter((result) => result.rank >= 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, MAX_RESULTS)
      .map((result) => result.entry)
  }, [entries, query])

  // biome-ignore lint/correctness/useExhaustiveDependencies: query is the reset trigger — a new query starts the selection at the first result
  useEffect(() => setActive(0), [query])

  function go(entry: SearchEntry | undefined) {
    if (!entry) return
    setOpen(false)
    setQuery('')
    router.push(entry.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-border px-2.5 py-1.5 text-micro text-fg-subtle transition-colors hover:border-border-strong hover:text-fg"
      >
        <span aria-hidden>⌕</span>
        <span>Search</span>
        <kbd className="kbd hidden sm:inline">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-canvas/80 px-4 pt-[12vh] backdrop-blur-sm"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search the documentation"
            className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-raised shadow-[var(--lift-lg)]"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span aria-hidden className="font-mono text-accent">
                ⌕
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActive((index) => Math.min(index + 1, results.length - 1))
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActive((index) => Math.max(index - 1, 0))
                  } else if (event.key === 'Enter') {
                    event.preventDefault()
                    go(results[active])
                  }
                }}
                placeholder="Search the documentation…"
                aria-label="Search the documentation"
                className="w-full bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
              />
              <kbd className="kbd">esc</kbd>
            </div>

            <div className="overflow-y-auto">
              {failed ? (
                <p className="px-4 py-6 text-micro text-fg-subtle">
                  The search index could not be loaded. Every document is listed on the{' '}
                  <a className="textlink" href="/docs">
                    documentation index
                  </a>
                  .
                </p>
              ) : query.trim() === '' ? (
                <p className="px-4 py-6 text-micro text-fg-subtle">
                  Type to search every published document. Results are sections, not pages.
                </p>
              ) : results.length === 0 ? (
                <p className="px-4 py-6 text-micro text-fg-subtle">
                  Nothing matches “{query}”. {entries ? '' : 'The index is still loading.'}
                </p>
              ) : (
                <ul>
                  {results.map((entry, index) => (
                    <li key={entry.href}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(entry)}
                        className={`flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left transition-colors ${
                          index === active ? 'bg-surface' : ''
                        }`}
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="text-base text-fg">{entry.heading}</span>
                          <span className="font-mono text-micro tracking-[0.08em] text-fg-subtle uppercase">
                            {entry.document}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-micro text-fg-muted">
                          {entry.snippet}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
