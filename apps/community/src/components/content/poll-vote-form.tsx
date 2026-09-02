'use client'

import { useActionState } from 'react'

import { votePollAction } from '@/server/poll-actions'
import type { PollVoteView } from '@/view/poll-vote'

import { PendingButton } from '../auth/form-controls'
import { type Copy, formatFromCopy } from '../shell/copy'
import { ProgressiveMarker } from './progressive-marker'

export function PollVoteForm({
  threadId,
  pollId,
  initial,
  copy,
}: {
  threadId: number
  pollId: number
  initial: PollVoteView
  copy: Copy
}) {
  const [state, action] = useActionState(votePollAction, initial)
  const view = state ?? initial

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="pollId" value={pollId} />
      <ProgressiveMarker />

      {view.options.map((option) => (
        <div key={option.id} className="flex flex-col gap-1">
          {view.mayCast ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type={view.multiple ? 'checkbox' : 'radio'}
                name="optionId"
                value={option.id}
                defaultChecked={option.checked}
              />
              <span>
                {option.label} ({option.votes})
              </span>
            </label>
          ) : (
            <p className="text-sm">
              {option.label} ({option.votes})
            </p>
          )}
          <div className="flex items-center gap-2 pl-6">
            <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${option.share}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
              {option.share}%
            </span>
          </div>
          {view.publicVotes && option.voterNames.length > 0 && (
            <p className="pl-6 text-sm text-muted-foreground">
              {formatFromCopy(copy, 'pollForm.votedBy', { names: option.voterNames.join(', ') })}
              {option.moreVoters > 0 &&
                ` ${formatFromCopy(copy, 'pollForm.moreVoters', { count: option.moreVoters })}`}
            </p>
          )}
        </div>
      ))}

      <p className="text-sm text-muted-foreground">
        {formatFromCopy(copy, 'pollForm.votes', { count: view.total })}
      </p>

      {view.mayCast ? (
        <PendingButton showWorking>
          {view.hasVoted
            ? formatFromCopy(copy, 'pollForm.changeVote', {})
            : formatFromCopy(copy, 'pollForm.vote', {})}
        </PendingButton>
      ) : (
        view.closed && (
          <p className="text-sm text-muted-foreground">
            {formatFromCopy(copy, 'pollForm.closed', {})}
          </p>
        )
      )}
    </form>
  )
}
