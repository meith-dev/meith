'use client'

import { useEffect, useState } from 'react'

import { buttonVariants, cn } from '@meith/ui'

import { toggleMultiquote, useMultiquote } from './multiquote'

export function MultiQuoteButton({ postId }: { postId: number }) {
  const held = useMultiquote().ids.includes(postId)

  const [enhanced, setEnhanced] = useState(false)
  useEffect(() => setEnhanced(true), [])
  if (!enhanced) return null

  return (
    <button
      type="button"
      aria-pressed={held}
      onClick={() => toggleMultiquote(postId)}
      className={cn(
        buttonVariants({ variant: held ? 'secondary' : 'ghost', size: 'sm' }),
        held && 'text-foreground',
      )}
    >
      <span aria-hidden="true">{held ? '✓' : '+'}</span>
      Multi-quote
    </button>
  )
}
