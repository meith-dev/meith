'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { regenerateFeedTokenAction, revokeFeedTokenAction } from '@/server/feed-token-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const CARD = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-5'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const GHOST_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const REVEAL_CODE = 'block overflow-x-auto rounded-sm bg-card px-2 py-1 font-mono text-xs'

export function FeedTokenPanel({
  active,
  detail,
  copy,
}: {
  active: boolean
  detail: string | null
  copy: Copy
}) {
  const [genState, genAction] = useActionState(regenerateFeedTokenAction, EMPTY_STATE)
  const [revState, revAction] = useActionState(revokeFeedTokenAction, EMPTY_STATE)

  const reveal = genState.notice === 'feed:issued' ? genState.values : undefined

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.feed.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{fromCopy(copy, 'accountForm.feed.blurb')}</p>
      </div>

      <FormError message={genState.error ?? revState.error} />

      {reveal?.token !== undefined && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-accent bg-post-highlight px-3 py-3"
        >
          <p className="text-sm font-semibold">{fromCopy(copy, 'accountForm.feed.copyNow')}</p>
          <code className="block overflow-x-auto rounded-sm bg-card px-2 py-1 font-mono text-sm">
            {reveal.token}
          </code>
          <p className="text-sm font-medium">{fromCopy(copy, 'accountForm.feed.rssLabel')}</p>
          <code className={REVEAL_CODE}>{reveal.rssUrl}</code>
          <p className="text-sm font-medium">{fromCopy(copy, 'accountForm.feed.atomLabel')}</p>
          <code className={REVEAL_CODE}>{reveal.atomUrl}</code>
          <p className="text-xs text-muted-foreground">
            {fromCopy(copy, 'accountForm.feed.revealHint')}
          </p>
        </div>
      )}

      <p className="text-sm">
        {active
          ? fromCopy(copy, 'accountForm.feed.active')
          : fromCopy(copy, 'accountForm.feed.none')}
        {active && detail !== null && (
          <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
        )}
      </p>

      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'accountForm.feed.warning')}</p>

      <div className="flex flex-wrap gap-3">
        <form action={genAction}>
          <PendingButton showWorking className={BUTTON}>
            {active
              ? fromCopy(copy, 'accountForm.feed.regenerate')
              : fromCopy(copy, 'accountForm.feed.generate')}
          </PendingButton>
        </form>

        {active && (
          <form action={revAction}>
            <PendingButton showWorking className={GHOST_BUTTON}>
              {fromCopy(copy, 'accountForm.feed.revoke')}
            </PendingButton>
          </form>
        )}
      </div>
    </section>
  )
}
