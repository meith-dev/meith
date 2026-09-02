import { POLL_CHOICES_UNLIMITED, type Poll, pollOptionShares } from '@meith/polls'
import { TextLink } from '@meith/ui'

import { getTranslator } from '@/server/i18n'
import { votePollAction } from '@/server/poll-actions'

import { PendingButton } from '../auth/form-controls'

export async function PollForm({
  poll,
  threadId,
  canVote,
  editHref,
}: {
  poll: Poll
  threadId: number
  canVote: boolean
  editHref?: string | null
}) {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0)
  const shares = pollOptionShares(poll.options.map((option) => option.votes))
  const t = await getTranslator()

  const closed = poll.closesAt !== null && poll.closesAt <= new Date()
  const hasVoted = poll.votedOptionIds.length > 0
  const mayCast = canVote && !closed && (!hasVoted || poll.allowRevote)
  const multiple = poll.maxOptions !== 1

  return (
    <section
      aria-label={t.t('pollForm.label')}
      className="mt-4 rounded-md border border-border p-4"
    >
      <h2 className="font-medium">{poll.question}</h2>

      {multiple && (
        <p className="mt-1 text-sm text-muted-foreground">
          {poll.maxOptions === POLL_CHOICES_UNLIMITED
            ? t.t('pollForm.chooseAny')
            : t.t('pollForm.chooseUpTo', { max: poll.maxOptions })}
        </p>
      )}
      {poll.publicVotes && (
        <p className="mt-1 text-sm text-muted-foreground">{t.t('pollForm.publicNotice')}</p>
      )}

      <form action={votePollAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="pollId" value={poll.id} />
        {poll.options.map((option, index) => (
          <div key={option.id} className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name="optionId"
                value={option.id}
                defaultChecked={poll.votedOptionIds.includes(option.id)}
                disabled={!mayCast}
              />
              <span>
                {option.label} ({option.votes})
              </span>
            </label>
            <div className="flex items-center gap-2 pl-6">
              <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${shares[index] ?? 0}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
                {shares[index] ?? 0}%
              </span>
            </div>
            {poll.publicVotes && option.voters.length > 0 && (
              <p className="pl-6 text-sm text-muted-foreground">
                {t.t('pollForm.votedBy', {
                  names: option.voters.map((voter) => voter.username).join(', '),
                })}
                {option.votes > option.voters.length &&
                  ` ${t.t('pollForm.moreVoters', { count: option.votes - option.voters.length })}`}
              </p>
            )}
          </div>
        ))}
        <p className="text-sm text-muted-foreground">{t.t('pollForm.votes', { count: total })}</p>
        {mayCast ? (
          <PendingButton showWorking>
            {hasVoted ? t.t('pollForm.changeVote') : t.t('pollForm.vote')}
          </PendingButton>
        ) : (
          closed && <p className="text-sm text-muted-foreground">{t.t('pollForm.closed')}</p>
        )}
      </form>

      {typeof editHref === 'string' && (
        <p className="mt-3 text-sm">
          <TextLink href={editHref}>{t.t('pollForm.edit')}</TextLink>
        </p>
      )}
    </section>
  )
}
