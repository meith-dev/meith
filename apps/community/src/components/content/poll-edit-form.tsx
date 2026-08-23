import { POLL_OPTION_LENGTH_MAX, POLL_QUESTION_MAX, type Poll } from '@meith/polls'

import { getTranslator } from '@/server/i18n'
import { editPollAction } from '@/server/poll-actions'

const NEW_OPTION_SLOTS = ['first', 'second', 'third'] as const

function inputValue(at: Date | null): string {
  return at === null ? '' : at.toISOString().slice(0, 16)
}

export async function PollEditForm({ poll, threadId }: { poll: Poll; threadId: number }) {
  const t = await getTranslator()
  const voted = poll.options.some((option) => option.votes > 0)

  return (
    <form action={editPollAction} className="flex flex-col gap-4">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="pollId" value={poll.id} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.t('pollEdit.question')}</span>
        <input
          type="text"
          name="question"
          required
          maxLength={POLL_QUESTION_MAX}
          defaultValue={poll.question}
        />
      </label>

      {poll.options.map((option, index) => (
        <label key={option.id} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.t('pollEdit.option', { number: index + 1 })}</span>
          <input type="hidden" name="optionRef" value={option.id} />
          <input
            type="text"
            name="optionLabel"
            maxLength={POLL_OPTION_LENGTH_MAX}
            defaultValue={option.label}
          />
          <span className="text-xs text-muted-foreground">
            {option.votes > 0
              ? t.t('pollEdit.optionVoted', { count: option.votes })
              : t.t('pollEdit.optionEmpty')}
          </span>
        </label>
      ))}

      {NEW_OPTION_SLOTS.map((slot, index) => (
        <label key={slot} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">
            {t.t('pollEdit.option', { number: poll.options.length + index + 1 })}
          </span>
          <input type="hidden" name="optionRef" value="" />
          <input type="text" name="optionLabel" maxLength={POLL_OPTION_LENGTH_MAX} />
        </label>
      ))}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.t('pollEdit.maxOptions')}</span>
        <input type="number" name="maxOptions" min={0} step={1} defaultValue={poll.maxOptions} />
        <span className="text-xs text-muted-foreground">{t.t('pollEdit.maxOptionsHint')}</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.t('pollEdit.closesAt')}</span>
        <input type="datetime-local" name="closesAt" defaultValue={inputValue(poll.closesAt)} />
        <span className="text-xs text-muted-foreground">{t.t('pollEdit.closesAtHint')}</span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowRevote" value="1" defaultChecked={poll.allowRevote} />
        <span>{t.t('pollEdit.allowRevote')}</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          <input
            type="checkbox"
            name="publicVotes"
            value="1"
            defaultChecked={poll.publicVotes}
            disabled={voted && !poll.publicVotes}
          />
          <span>{t.t('pollEdit.publicVotes')}</span>
        </span>
        <span className="text-xs text-muted-foreground">{t.t('pollEdit.publicVotesHint')}</span>
      </label>

      <div>
        <button type="submit">{t.t('pollEdit.save')}</button>
      </div>
    </form>
  )
}
