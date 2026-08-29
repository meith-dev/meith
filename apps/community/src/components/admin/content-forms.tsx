'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  createAnnouncementAction,
  createCaptchaQuestionAction,
  createDirectiveAction,
  createPrefixAction,
  createSmileyAction,
  createWordFilterAction,
  deleteAnnouncementAction,
  deleteAttachmentAction,
  deleteCaptchaQuestionAction,
  deleteDirectiveAction,
  deletePrefixAction,
  deleteSmileyAction,
  deleteWordFilterAction,
  updateAnnouncementAction,
  updateCaptchaQuestionAction,
  updateDirectiveAction,
  updateSmileyAction,
  updateWordFilterAction,
} from '@/server/content-admin-actions'

import { FormError, PendingButton, SubmitButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'
import { INPUT, Saved } from './form-bits'

export interface WordFilterValues {
  readonly id: number
  readonly pattern: string
  readonly replacement: string
  readonly wholeWord: boolean
  readonly enabled: boolean
}

export function WordFilterRowForm({ filter, copy }: { filter: WordFilterValues; copy: Copy }) {
  const [state, action] = useActionState(updateWordFilterAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteWordFilterAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>

      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="id" value={filter.id} />

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.filter.match')}</span>
          <input name="pattern" defaultValue={filter.pattern} className={INPUT} required />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.filter.showInstead')}</span>
          <input name="replacement" defaultValue={filter.replacement} className={INPUT} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="wholeWord"
            value="1"
            defaultChecked={filter.wholeWord}
            className="size-4"
          />
          <span>{fromCopy(copy, 'adminContent.filter.wholeWords')}</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={filter.enabled}
            className="size-4"
          />
          <span>{fromCopy(copy, 'adminContent.filter.active')}</span>
        </label>

        <span className="min-w-24">
          <SubmitButton>{fromCopy(copy, 'adminContent.save')}</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={filter.id} />
        <PendingButton showWorking className="text-xs text-muted-foreground hover:underline">
          {fromCopy(copy, 'adminContent.filter.removeThis')}
        </PendingButton>
      </form>
    </div>
  )
}

export function NewWordFilterForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(createWordFilterAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminContent.added')}</Saved>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.filter.match')}</span>
        <input name="pattern" className={INPUT} required />
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.filter.showInstead')}</span>
        <input name="replacement" className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminContent.filter.showInsteadHint')}
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="wholeWord" value="1" defaultChecked className="size-4" />
        <span>{fromCopy(copy, 'adminContent.filter.wholeWords')}</span>
      </label>

      <span className="min-w-28">
        <SubmitButton>{fromCopy(copy, 'adminContent.add')}</SubmitButton>
      </span>
    </form>
  )
}

export interface PrefixValues {
  readonly id: number
  readonly label: string
  readonly token: string | null
  readonly displayOrder: number
  readonly forumPathPrefix: string | null
}

export function DeletePrefixForm({ prefix, copy }: { prefix: PrefixValues; copy: Copy }) {
  const [state, action] = useActionState(deletePrefixAction, EMPTY_STATE)

  return (
    <form action={action} className="flex items-center gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="id" value={prefix.id} />
      <PendingButton showWorking className="text-xs text-muted-foreground hover:underline">
        {fromCopy(copy, 'admin.remove')}
      </PendingButton>
    </form>
  )
}

export function NewPrefixForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(createPrefixAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminContent.added')}</Saved>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.prefix.label')}</span>
          <input name="label" className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.prefix.styleToken')}</span>
          <input name="token" className={INPUT} />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminContent.prefix.styleTokenHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.prefix.displayOrder')}</span>
          <input type="number" name="displayOrder" min={0} defaultValue={0} className={INPUT} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.prefix.onlyBranch')}</span>
          <input name="forumPathPrefix" className={INPUT} />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminContent.prefix.onlyBranchHint')}
          </span>
        </label>
      </div>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminContent.prefix.add')}</SubmitButton>
      </div>
    </form>
  )
}

export interface SmileyValues {
  readonly id: number
  readonly code: string
  readonly src: string
  readonly alt: string | null
  readonly enabled: boolean
}

export function SmileyRowForm({ smiley, copy }: { smiley: SmileyValues; copy: Copy }) {
  const [state, action] = useActionState(updateSmileyAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteSmileyAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>

      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="id" value={smiley.id} />

        <img
          src={smiley.src}
          alt={smiley.alt ?? smiley.code}
          className="size-6 shrink-0 self-center"
        />

        <label className="flex w-28 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.smiley.code')}</span>
          <input name="code" defaultValue={smiley.code} className={INPUT} required />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.smiley.image')}</span>
          <input name="src" defaultValue={smiley.src} className={INPUT} required />
        </label>

        <label className="flex w-32 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.smiley.altText')}</span>
          <input name="alt" defaultValue={smiley.alt ?? ''} className={INPUT} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={smiley.enabled}
            className="size-4"
          />
          <span>{fromCopy(copy, 'adminContent.enabled')}</span>
        </label>

        <span className="min-w-24">
          <SubmitButton>{fromCopy(copy, 'adminContent.save')}</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={smiley.id} />
        <PendingButton showWorking className="text-xs text-destructive hover:underline">
          {fromCopy(copy, 'admin.remove')}
        </PendingButton>
      </form>
    </div>
  )
}

export function NewSmileyForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(createSmileyAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminContent.added')}</Saved>

      <label className="flex w-28 flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.smiley.code')}</span>
        <input
          name="code"
          className={INPUT}
          placeholder={fromCopy(copy, 'adminContent.smiley.codePlaceholder')}
          required
        />
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.smiley.image')}</span>
        <input
          name="src"
          className={INPUT}
          placeholder={fromCopy(copy, 'adminContent.smiley.imagePlaceholder')}
          required
        />
      </label>

      <label className="flex w-32 flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.smiley.altText')}</span>
        <input name="alt" className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminContent.smiley.altTextHint')}
        </span>
      </label>

      <span className="min-w-28">
        <SubmitButton>{fromCopy(copy, 'adminContent.add')}</SubmitButton>
      </span>
    </form>
  )
}

export interface DirectiveValues {
  readonly id: number
  readonly name: string
  readonly block: boolean
  readonly description: string | null
  readonly enabled: boolean
}

export function DirectiveRowForm({ directive, copy }: { directive: DirectiveValues; copy: Copy }) {
  const [state, action] = useActionState(updateDirectiveAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteDirectiveAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>

      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="id" value={directive.id} />

        <label className="flex w-36 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.directive.name')}</span>
          <input name="name" defaultValue={directive.name} className={INPUT} required />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.directive.note')}</span>
          <input name="description" defaultValue={directive.description ?? ''} className={INPUT} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="block"
            value="1"
            defaultChecked={directive.block}
            className="size-4"
          />
          <span>{fromCopy(copy, 'adminContent.directive.block')}</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={directive.enabled}
            className="size-4"
          />
          <span>{fromCopy(copy, 'adminContent.enabled')}</span>
        </label>

        <span className="min-w-24">
          <SubmitButton>{fromCopy(copy, 'adminContent.save')}</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={directive.id} />
        <PendingButton showWorking className="text-xs text-destructive hover:underline">
          {fromCopy(copy, 'admin.remove')}
        </PendingButton>
      </form>
    </div>
  )
}

export function NewDirectiveForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(createDirectiveAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminContent.added')}</Saved>

      <label className="flex w-36 flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.directive.name')}</span>
        <input
          name="name"
          className={INPUT}
          placeholder={fromCopy(copy, 'adminContent.directive.namePlaceholder')}
          required
        />
        <span className="text-xs text-muted-foreground">
          {copy['adminContent.directive.nameHintLead']}
          <code>:::note</code>
          {copy['adminContent.directive.nameHintMid']}
          <code>:note[…]</code>
          {copy['adminContent.directive.nameHintTail']}
        </span>
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.directive.note')}</span>
        <input name="description" className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminContent.directive.noteHint')}
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="block" value="1" className="size-4" />
        <span>{fromCopy(copy, 'adminContent.directive.block')}</span>
      </label>

      <span className="min-w-28">
        <SubmitButton>{fromCopy(copy, 'adminContent.add')}</SubmitButton>
      </span>
    </form>
  )
}

export function DeleteAttachmentForm({ attachmentId, copy }: { attachmentId: number; copy: Copy }) {
  const [state, action] = useActionState(deleteAttachmentAction, EMPTY_STATE)

  return (
    <form action={action} className="shrink-0">
      <FormError message={state.error} />
      <input type="hidden" name="id" value={attachmentId} />
      <PendingButton showWorking className="text-xs text-destructive hover:underline">
        {fromCopy(copy, 'adminContent.attachment.delete')}
      </PendingButton>
    </form>
  )
}

export interface AnnouncementValues {
  readonly id: number
  readonly forumId: number | null
  readonly title: string
  readonly message: string
  readonly startsAtInput: string
  readonly endsAtInput: string
  readonly enabled: boolean
}

export interface ForumChoice {
  readonly id: number
  readonly label: string
}

function AnnouncementFields({
  forums,
  values,
  copy,
}: {
  forums: readonly ForumChoice[]
  values?: AnnouncementValues
  copy: Copy
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.announcement.title')}</span>
        <input name="title" defaultValue={values?.title ?? ''} className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.announcement.message')}</span>
        <textarea
          name="message"
          rows={5}
          defaultValue={values?.message ?? ''}
          className={INPUT}
          required
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminContent.announcement.messageHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.announcement.where')}</span>
        <select
          name="forumId"
          defaultValue={
            values?.forumId === null || values === undefined ? '' : String(values.forumId)
          }
          className={INPUT}
        >
          <option value="">{fromCopy(copy, 'adminContent.announcement.wholeBoard')}</option>
          {forums.map((forum) => (
            <option key={forum.id} value={forum.id}>
              {forum.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminContent.announcement.whereHint')}
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.announcement.from')}</span>
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={values?.startsAtInput ?? ''}
            className={INPUT}
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.announcement.until')}</span>
          <input
            type="datetime-local"
            name="endsAt"
            defaultValue={values?.endsAtInput ?? ''}
            className={INPUT}
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminContent.announcement.untilHint')}
          </span>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'adminContent.announcement.timesUtc')}
      </p>
    </>
  )
}

export function AnnouncementRowForm({
  announcement,
  forums,
  copy,
}: {
  announcement: AnnouncementValues
  forums: readonly ForumChoice[]
  copy: Copy
}) {
  const [state, action] = useActionState(updateAnnouncementAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteAnnouncementAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-3 py-4">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={announcement.id} />
        <AnnouncementFields forums={forums} values={announcement} copy={copy} />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value="1"
              defaultChecked={announcement.enabled}
              className="size-4"
            />
            <span>{fromCopy(copy, 'adminContent.enabled')}</span>
          </label>

          <span className="min-w-28">
            <SubmitButton>{fromCopy(copy, 'adminContent.save')}</SubmitButton>
          </span>
        </div>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={announcement.id} />
        <PendingButton showWorking className="text-xs text-destructive hover:underline">
          {fromCopy(copy, 'admin.remove')}
        </PendingButton>
      </form>
    </div>
  )
}

export function NewAnnouncementForm({
  forums,
  copy,
}: {
  forums: readonly ForumChoice[]
  copy: Copy
}) {
  const [state, action] = useActionState(createAnnouncementAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminContent.added')}</Saved>

      <AnnouncementFields forums={forums} copy={copy} />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" value="1" defaultChecked className="size-4" />
          <span>{fromCopy(copy, 'adminContent.enabled')}</span>
        </label>

        <span className="min-w-28">
          <SubmitButton>{fromCopy(copy, 'adminContent.add')}</SubmitButton>
        </span>
      </div>
    </form>
  )
}

export interface CaptchaQuestionValues {
  readonly id: number
  readonly question: string
  readonly answers: readonly string[]
  readonly enabled: boolean
}

export function CaptchaQuestionRowForm({
  question,
  copy,
}: {
  question: CaptchaQuestionValues
  copy: Copy
}) {
  const [state, action] = useActionState(updateCaptchaQuestionAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteCaptchaQuestionAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={question.id} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.captcha.question')}</span>
          <input name="question" defaultValue={question.question} className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminContent.captcha.answers')}</span>
          <textarea
            name="answers"
            rows={3}
            defaultValue={question.answers.join('\n')}
            className={INPUT}
            required
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminContent.captcha.answersHint')}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value="1"
              defaultChecked={question.enabled}
              className="size-4"
            />
            <span>{fromCopy(copy, 'adminContent.enabled')}</span>
          </label>

          <span className="min-w-24">
            <SubmitButton>{fromCopy(copy, 'adminContent.save')}</SubmitButton>
          </span>
        </div>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={question.id} />
        <PendingButton showWorking className="text-xs text-destructive hover:underline">
          {fromCopy(copy, 'admin.remove')}
        </PendingButton>
      </form>
    </div>
  )
}

export function NewCaptchaQuestionForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(createCaptchaQuestionAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'adminContent.added')}</Saved>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.captcha.question')}</span>
        <input
          name="question"
          className={INPUT}
          placeholder={fromCopy(copy, 'adminContent.captcha.questionPlaceholder')}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminContent.captcha.answers')}</span>
        <textarea name="answers" rows={3} className={INPUT} required />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminContent.captcha.answersHint')}
        </span>
      </label>

      <span className="min-w-28">
        <SubmitButton>{fromCopy(copy, 'adminContent.add')}</SubmitButton>
      </span>
    </form>
  )
}
