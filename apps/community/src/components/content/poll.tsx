import type { Poll } from '@meith/polls'

import { getTranslator } from '@/server/i18n'
import { votePollAction } from '@/server/poll-actions'

export async function PollForm({
  poll,
  threadId,
  canVote,
}: {
  poll: Poll
  threadId: number
  canVote: boolean
}) {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0)
  const t = await getTranslator()
  return (
    <section
      aria-label={t.t('pollForm.label')}
      className="mt-4 rounded-md border border-border p-4"
    >
      <h2 className="font-medium">{poll.question}</h2>
      <form action={votePollAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="pollId" value={poll.id} />
        {poll.options.map((option) => (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="optionId"
              value={option.id}
              disabled={!canVote || poll.votedOptionId !== null}
            />
            <span>
              {option.label} ({option.votes})
            </span>
          </label>
        ))}
        {canVote && poll.votedOptionId === null ? (
          <button type="submit">{t.t('pollForm.vote')}</button>
        ) : (
          <p className="text-sm text-muted-foreground">{t.t('pollForm.votes', { count: total })}</p>
        )}
      </form>
    </section>
  )
}
