'use client'

import { useActionState } from 'react'

import { cn } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { thankForPostAction } from '@/server/reputation-actions'

import { formatFromCopy, fromCopy, useCopy } from '../shell/copy'

export function ThanksButton({
  postId,
  authorUserId,
  returnTo,
  thanked,
  count,
}: {
  postId: number
  authorUserId: number
  returnTo: string
  thanked: boolean
  count: number
}) {
  const [state, action] = useActionState(thankForPostAction, EMPTY_STATE)
  const copy = useCopy()

  return (
    <form action={action} className="inline-flex items-center">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="userId" value={authorUserId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <button
        type="submit"
        aria-pressed={thanked}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          thanked
            ? 'bg-moderation-approved/10 text-moderation-approved hover:bg-moderation-approved/20'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <span aria-hidden="true">{thanked ? '★' : '☆'}</span>
        {thanked
          ? fromCopy(copy, 'composer.thanks.thanked')
          : fromCopy(copy, 'composer.thanks.thanks')}
        {count > 0 && (
          <span className="tabular-nums opacity-70">
            {count}
            <span className="sr-only">
              {' '}
              {formatFromCopy(copy, 'composer.thanks.count', { count })}
            </span>
          </span>
        )}
      </button>

      {state.error !== undefined && (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      )}
    </form>
  )
}
