'use client'

/**
 * F45's multiquote: collect several posts, then quote them all in one reply.
 *
 * A bare `<button>` until now, which Tailwind's preflight renders as plain
 * text — so every postbit on the board carried a full-width ruled row
 * containing the unstyled word "Multi-quote". On a page of fifty posts that is
 * fifty rows of furniture around a control most readers never use.
 *
 * It is a small ghost button now, matching the post's own actions underneath
 * it, so the row it sits in reads as part of the postbit rather than as
 * something that failed to load.
 *
 * The behaviour is unchanged and still enhancement-only: the selection lives in
 * `sessionStorage` and the reply form reads it on mount, so with scripting off
 * nothing renders and the per-post "Quote" link — a real link to the reply page
 * — is how quoting works.
 */

import { buttonVariants } from '@meith/ui'

export function MultiQuoteButton({ author, message }: { author: string; message: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const quotes = JSON.parse(sessionStorage.getItem('multiquote') ?? '[]') as Array<{
          author: string
          message: string
        }>
        sessionStorage.setItem('multiquote', JSON.stringify([...quotes, { author, message }]))
      }}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      Multi-quote
    </button>
  )
}
