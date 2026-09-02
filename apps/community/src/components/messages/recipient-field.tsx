'use client'

import { useRef, useState } from 'react'

import type { MemberSuggestion } from '@meith/accounts'

import { useMentionCombobox } from '../content/mention-combobox'
import {
  activeRecipientSegment,
  fillRecipient,
  type RecipientSegment,
} from '../content/recipient-segment'
import { fromCopy, useCopy } from '../shell/copy'

export function RecipientField({
  id,
  name,
  defaultValue,
  className,
  required = false,
}: {
  readonly id: string
  readonly name: string
  readonly defaultValue: string
  readonly className?: string
  readonly required?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const segment = useRef<RecipientSegment | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const copy = useCopy()

  function sync(element: HTMLInputElement): void {
    const caret = element.selectionStart
    const found =
      caret !== null && caret === element.selectionEnd
        ? activeRecipientSegment(element.value, caret)
        : null
    segment.current = found
    setQuery(found?.query ?? null)
  }

  function close(): void {
    segment.current = null
    setQuery(null)
  }

  function choose(candidate: MemberSuggestion): void {
    const element = input.current
    const active = segment.current
    if (element === null || active === null) return

    const next = fillRecipient(element.value, active, candidate.username)
    element.value = next.value
    element.setSelectionRange(next.caret, next.caret)
    element.focus()
    close()
  }

  const combobox = useMentionCombobox({
    query,
    onChoose: choose,
    onDismiss: close,
    label: (candidate) => candidate.username,
    listboxLabel: fromCopy(copy, 'composer.recipient.suggestions'),
  })

  return (
    <div className="relative">
      <input
        ref={input}
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={className}
        required={required}
        autoComplete="off"
        onKeyDown={combobox.handleKeyDown}
        onInput={(event) => sync(event.currentTarget)}
        onSelect={(event) => sync(event.currentTarget)}
        onBlur={close}
        {...combobox.anchorProps}
      />
      {combobox.listbox}
      {combobox.liveRegion}
    </div>
  )
}
