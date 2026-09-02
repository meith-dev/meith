import { Fragment } from 'react'

import { POLL_OPTION_LENGTH_MAX, POLL_QUESTION_MAX, type Poll } from '@meith/polls'
import { Field, Input } from '@meith/ui'

import { getTranslator } from '@/server/i18n'
import { editPollAction } from '@/server/poll-actions'

import { PendingButton } from '../auth/form-controls'

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

      <Field label={t.t('pollEdit.question')} name="question">
        {(control) => (
          <Input
            {...control}
            type="text"
            required
            maxLength={POLL_QUESTION_MAX}
            defaultValue={poll.question}
          />
        )}
      </Field>

      {poll.options.map((option, index) => (
        <Fragment key={option.id}>
          <input type="hidden" name="optionRef" value={option.id} />
          <Field
            id={`field-optionLabel-${option.id}`}
            label={t.t('pollEdit.option', { number: index + 1 })}
            name="optionLabel"
            description={
              option.votes > 0
                ? t.t('pollEdit.optionVoted', { count: option.votes })
                : t.t('pollEdit.optionEmpty')
            }
          >
            {(control) => (
              <Input
                {...control}
                type="text"
                maxLength={POLL_OPTION_LENGTH_MAX}
                defaultValue={option.label}
              />
            )}
          </Field>
        </Fragment>
      ))}

      {NEW_OPTION_SLOTS.map((slot, index) => (
        <Fragment key={slot}>
          <input type="hidden" name="optionRef" value="" />
          <Field
            id={`field-optionLabel-${slot}`}
            label={t.t('pollEdit.option', { number: poll.options.length + index + 1 })}
            name="optionLabel"
          >
            {(control) => <Input {...control} type="text" maxLength={POLL_OPTION_LENGTH_MAX} />}
          </Field>
        </Fragment>
      ))}

      <Field
        label={t.t('pollEdit.maxOptions')}
        name="maxOptions"
        description={t.t('pollEdit.maxOptionsHint')}
      >
        {(control) => (
          <Input {...control} type="number" min={0} step={1} defaultValue={poll.maxOptions} />
        )}
      </Field>

      <Field
        label={t.t('pollEdit.closesAt')}
        name="closesAt"
        description={t.t('pollEdit.closesAtHint')}
      >
        {(control) => (
          <Input {...control} type="datetime-local" defaultValue={inputValue(poll.closesAt)} />
        )}
      </Field>

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
        <PendingButton showWorking>{t.t('pollEdit.save')}</PendingButton>
      </div>
    </form>
  )
}
