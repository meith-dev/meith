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
 * Enhancement-only: the selection lives in `sessionStorage` and the reply form
 * reads it on mount, so with scripting off nothing renders and the per-post
 * "Quote" link — a real link to the reply page — is how quoting works.
 *
 * ## What is stored is the **id**, and nothing else
 *
 * It used to store the post's source text, which meant the page had to ship
 * every quotable post's Markdown to every reader for a button most of them
 * never press, and a quote collected an hour ago was still whatever the post
 * said an hour ago. An id is small, and the reply form resolves it through the
 * server — the same lookup the reply page uses, so what comes back is current
 * and is something this reader may actually see.
 */

import { buttonVariants } from '@meith/ui'

export function MultiQuoteButton({ postId }: { postId: number }) {
  return (
    <button
      type="button"
      onClick={() => {
        const ids = JSON.parse(sessionStorage.getItem('multiquote') ?? '[]') as unknown[]
        /* Collecting the same post twice is a slip, not an instruction. */
        const next = [...new Set([...ids.map(Number), postId])]
        sessionStorage.setItem('multiquote', JSON.stringify(next))
      }}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      Multi-quote
    </button>
  )
}
