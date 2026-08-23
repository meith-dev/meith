import { POLL_CHOICES_UNLIMITED, type Poll } from '@meith/polls'

import { getTranslator } from '@/server/i18n'
import { votePollAction } from '@/server/poll-actions'

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
        {poll.options.map((option) => (
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
        {mayCast ? (
          <button type="submit">
            {hasVoted ? t.t('pollForm.changeVote') : t.t('pollForm.vote')}
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {closed ? t.t('pollForm.closed') : t.t('pollForm.votes', { count: total })}
          </p>
        )}
      </form>

      {typeof editHref === 'string' && (
        <p className="mt-3 text-sm">
          <a href={editHref}>{t.t('pollForm.edit')}</a>
        </p>
      )}
    </section>
  )
}
