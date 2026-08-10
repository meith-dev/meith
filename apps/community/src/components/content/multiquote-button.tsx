'use client'

import { buttonVariants } from '@meith/ui'

export function MultiQuoteButton({ postId }: { postId: number }) {
  return (
    <button
      type="button"
      onClick={() => {
        const ids = JSON.parse(sessionStorage.getItem('multiquote') ?? '[]') as unknown[]
        const next = [...new Set([...ids.map(Number), postId])]
        sessionStorage.setItem('multiquote', JSON.stringify(next))
      }}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      Multi-quote
    </button>
  )
}
