'use client'

import { useEffect, useRef, useState } from 'react'

import { buttonVariants, cn } from '@meith/ui'

import { quotePostAction } from '@/server/content-actions'

import { composerField, insertQuotes } from './composer-field'
import {
  addedNotice,
  announceMultiquote,
  clearMultiquote,
  multiquoteIds,
  selectionLabel,
  takeMultiquote,
  useMultiquote,
} from './multiquote'

async function addQuotes(
  threadId: number,
  ids: readonly number[],
  reveal: boolean,
): Promise<string> {
  const field = composerField()
  if (field === null) return ''

  try {
    const quotes = (await Promise.all(ids.map((id) => quotePostAction(threadId, id)))).filter(
      (quote): quote is string => quote !== null,
    )
    if (quotes.length > 0) {
      takeMultiquote()
      insertQuotes(field, quotes, { reveal })
    }
    return addedNotice(quotes.length, ids.length)
  } catch {
    return addedNotice(0, ids.length)
  }
}

export function MultiQuoteSelection({
  threadId,
  insertOnMount = false,
}: {
  threadId: number
  insertOnMount?: boolean
}) {
  const { ids, notice } = useMultiquote()
  const [adding, setAdding] = useState(false)
  const inserted = useRef(false)

  useEffect(() => {
    if (!insertOnMount || inserted.current) return
    inserted.current = true

    const held = multiquoteIds()
    if (held.length === 0) return

    void addQuotes(threadId, held, false).then((message) => {
      if (message !== '') announceMultiquote(message)
    })
  }, [insertOnMount, threadId])

  async function add(): Promise<void> {
    setAdding(true)
    const message = await addQuotes(threadId, ids, true)
    setAdding(false)
    if (message !== '') announceMultiquote(message)
  }

  return (
    <>
      <p role="status" className="sr-only">
        {notice}
      </p>

      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selectionLabel(ids.length)}</span>
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ml-auto')}
          >
            {adding ? 'Adding…' : 'Add to reply'}
          </button>
          <button
            type="button"
            onClick={() => clearMultiquote()}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Clear
          </button>
        </div>
      )}
    </>
  )
}
