'use client'

import {
  type AriaAttributes,
  type AriaRole,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import type { MemberSuggestion } from '@meith/accounts'
import { cn } from '@meith/ui'

import { searchMentionCandidatesAction } from '@/server/mention-actions'

import { formatFromCopy, fromCopy, useCopy } from '../shell/copy'
import { comboboxKeyAction } from './combobox-keys'

const SEARCH_DEBOUNCE_MS = 150

export type AnchorProps = AriaAttributes & { readonly role?: AriaRole }

export interface MentionCombobox {
  readonly open: boolean
  readonly anchorProps: AnchorProps
  readonly handleKeyDown: (event: KeyboardEvent) => boolean
  readonly listbox: ReactNode
  readonly liveRegion: ReactNode
}

export interface MentionComboboxOptions {
  readonly query: string | null
  readonly onChoose: (candidate: MemberSuggestion) => void
  readonly onDismiss: () => void
  readonly label?: (candidate: MemberSuggestion) => string
  readonly listboxLabel?: string
}

export function useMentionCombobox({
  query,
  onChoose,
  onDismiss,
  label,
  listboxLabel,
}: MentionComboboxOptions): MentionCombobox {
  const copy = useCopy()
  const listboxId = useId()

  const [matches, setMatches] = useState<readonly MemberSuggestion[]>([])
  const [active, setActive] = useState(0)

  const latestQuery = useRef(query)
  latestQuery.current = query

  useEffect(() => {
    if (query === null) {
      setMatches([])
      return
    }

    const handle = setTimeout(() => {
      void searchMentionCandidatesAction(query).then((found) => {
        if (latestQuery.current !== query) return
        setMatches(found)
        setActive(0)
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [query])

  const open = query !== null && matches.length > 0
  const optionId = (index: number): string => `${listboxId}-option-${index}`
  const render = label ?? ((candidate: MemberSuggestion): string => `@${candidate.username}`)

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (!open) return false

    const action = comboboxKeyAction(event, { count: matches.length, active })
    if (action === null) return false

    event.preventDefault()
    if (action.type === 'move') setActive(action.active)
    else if (action.type === 'dismiss') onDismiss()
    else onChoose(matches[action.index]!)
    return true
  }

  const anchorProps: AnchorProps = open
    ? {
        role: 'combobox',
        'aria-expanded': true,
        'aria-controls': listboxId,
        'aria-activedescendant': optionId(active),
        'aria-autocomplete': 'list',
      }
    : {}

  const listbox = open ? (
    <div
      id={listboxId}
      role="listbox"
      aria-label={listboxLabel ?? fromCopy(copy, 'composer.mention.suggestions')}
      className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-card py-1 text-sm shadow-lg"
    >
      {matches.map((candidate, index) => (
        <button
          key={candidate.id}
          type="button"
          id={optionId(index)}
          role="option"
          aria-selected={index === active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(candidate)}
          onMouseEnter={() => setActive(index)}
          className={cn(
            'block w-full px-3 py-1.5 text-start',
            index === active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted',
          )}
        >
          {render(candidate)}
        </button>
      ))}
    </div>
  ) : null

  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {open ? formatFromCopy(copy, 'composer.mention.available', { count: matches.length }) : ''}
    </p>
  )

  return { open, anchorProps, handleKeyDown, listbox, liveRegion }
}
