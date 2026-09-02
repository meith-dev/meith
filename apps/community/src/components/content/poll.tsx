import { POLL_CHOICES_UNLIMITED, type Poll } from '@meith/polls'
import { TextLink } from '@meith/ui'

import { getTranslator } from '@/server/i18n'
import { patternCopy } from '@/view/copy'
import { pollVoteView } from '@/view/poll-vote'

import { PollVoteForm } from './poll-vote-form'

const POLL_VOTE_KEYS = ['pollForm.vote', 'pollForm.changeVote', 'pollForm.closed'] as const
const POLL_PATTERN_KEYS = ['pollForm.votes', 'pollForm.votedBy', 'pollForm.moreVoters'] as const

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
  const t = await getTranslator()
  const initial = pollVoteView(poll, canVote, new Date())
  const copy = patternCopy([...POLL_VOTE_KEYS, ...POLL_PATTERN_KEYS], t)

  return (
    <section
      aria-label={t.t('pollForm.label')}
      className="mt-4 rounded-md border border-border p-4"
    >
      <h2 className="font-medium">{poll.question}</h2>

      {initial.multiple && (
        <p className="mt-1 text-sm text-muted-foreground">
          {poll.maxOptions === POLL_CHOICES_UNLIMITED
            ? t.t('pollForm.chooseAny')
            : t.t('pollForm.chooseUpTo', { max: poll.maxOptions })}
        </p>
      )}
      {poll.publicVotes && (
        <p className="mt-1 text-sm text-muted-foreground">{t.t('pollForm.publicNotice')}</p>
      )}

      <PollVoteForm threadId={threadId} pollId={poll.id} initial={initial} copy={copy} />

      {typeof editHref === 'string' && (
        <p className="mt-3 text-sm">
          <TextLink href={editHref}>{t.t('pollForm.edit')}</TextLink>
        </p>
      )}
    </section>
  )
}
