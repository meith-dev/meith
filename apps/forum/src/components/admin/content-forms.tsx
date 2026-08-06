"use client"

import { useActionState } from "react"

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
} from "@/server/content-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

function Saved({ when, children }: { when: boolean; children: React.ReactNode }) {
  if (!when) return null
  return (
    <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
      {children}
    </p>
  )
}

export interface WordFilterValues {
  readonly id: number
  readonly pattern: string
  readonly replacement: string
  readonly wholeWord: boolean
  readonly enabled: boolean
}

export function WordFilterRowForm({ filter }: { filter: WordFilterValues }) {
  const [state, action] = useActionState(updateWordFilterAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteWordFilterAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>

      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="id" value={filter.id} />

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Match</span>
          <input name="pattern" defaultValue={filter.pattern} className={INPUT} required />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Show instead</span>
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
          <span>Whole words</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={filter.enabled}
            className="size-4"
          />
          <span>Active</span>
        </label>

        <span className="min-w-24">
          <SubmitButton>Save</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={filter.id} />
        <button type="submit" className="text-xs text-muted-foreground hover:underline">
          Remove this filter
        </button>
      </form>
    </div>
  )
}

export function NewWordFilterForm() {
  const [state, action] = useActionState(createWordFilterAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Added.</Saved>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">Match</span>
        <input name="pattern" className={INPUT} required />
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">Show instead</span>
        <input name="replacement" className={INPUT} />
        <span className="text-xs text-muted-foreground">Blank removes the word.</span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="wholeWord" value="1" defaultChecked className="size-4" />
        <span>Whole words</span>
      </label>

      <span className="min-w-28">
        <SubmitButton>Add</SubmitButton>
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

export function DeletePrefixForm({ prefix }: { prefix: PrefixValues }) {
  const [state, action] = useActionState(deletePrefixAction, EMPTY_STATE)

  return (
    <form action={action} className="flex items-center gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="id" value={prefix.id} />
      <button type="submit" className="text-xs text-muted-foreground hover:underline">
        Remove
      </button>
    </form>
  )
}

export function NewPrefixForm() {
  const [state, action] = useActionState(createPrefixAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Added.</Saved>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Label</span>
          <input name="label" className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Style token</span>
          <input name="token" className={INPUT} />
          <span className="text-xs text-muted-foreground">
            Names a theme token for its colour. Blank uses the default.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Display order</span>
          <input type="number" name="displayOrder" min={0} defaultValue={0} className={INPUT} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Only in this branch</span>
          <input name="forumPathPrefix" className={INPUT} />
          <span className="text-xs text-muted-foreground">
            A forum path, to scope the prefix to one branch of the tree. Blank
            offers it everywhere.
          </span>
        </label>
      </div>

      <div>
        <SubmitButton>Add prefix</SubmitButton>
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

export function SmileyRowForm({ smiley }: { smiley: SmileyValues }) {
  const [state, action] = useActionState(updateSmileyAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteSmileyAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>

      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="id" value={smiley.id} />

        { }
        <img
          src={smiley.src}
          alt={smiley.alt ?? smiley.code}
          className="size-6 shrink-0 self-center"
        />

        <label className="flex w-28 flex-col gap-1 text-sm">
          <span className="font-medium">Code</span>
          <input name="code" defaultValue={smiley.code} className={INPUT} required />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Image</span>
          <input name="src" defaultValue={smiley.src} className={INPUT} required />
        </label>

        <label className="flex w-32 flex-col gap-1 text-sm">
          <span className="font-medium">Alt text</span>
          <input name="alt" defaultValue={smiley.alt ?? ""} className={INPUT} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={smiley.enabled}
            className="size-4"
          />
          <span>Enabled</span>
        </label>

        <span className="min-w-24">
          <SubmitButton>Save</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={smiley.id} />
        <button type="submit" className="text-xs text-destructive hover:underline">
          Remove
        </button>
      </form>
    </div>
  )
}

export function NewSmileyForm() {
  const [state, action] = useActionState(createSmileyAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Added.</Saved>

      <label className="flex w-28 flex-col gap-1 text-sm">
        <span className="font-medium">Code</span>
        <input name="code" className={INPUT} placeholder=":)" required />
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">Image</span>
        <input name="src" className={INPUT} placeholder="/smilies/smile.png" required />
      </label>

      <label className="flex w-32 flex-col gap-1 text-sm">
        <span className="font-medium">Alt text</span>
        <input name="alt" className={INPUT} />
        <span className="text-xs text-muted-foreground">Defaults to the code.</span>
      </label>

      <span className="min-w-28">
        <SubmitButton>Add</SubmitButton>
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

export function DirectiveRowForm({ directive }: { directive: DirectiveValues }) {
  const [state, action] = useActionState(updateDirectiveAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteDirectiveAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>

      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="id" value={directive.id} />

        <label className="flex w-36 flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input name="name" defaultValue={directive.name} className={INPUT} required />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Note</span>
          <input name="description" defaultValue={directive.description ?? ""} className={INPUT} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="block"
            value="1"
            defaultChecked={directive.block}
            className="size-4"
          />
          <span>Block</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={directive.enabled}
            className="size-4"
          />
          <span>Enabled</span>
        </label>

        <span className="min-w-24">
          <SubmitButton>Save</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={directive.id} />
        <button type="submit" className="text-xs text-destructive hover:underline">
          Remove
        </button>
      </form>
    </div>
  )
}

export function NewDirectiveForm() {
  const [state, action] = useActionState(createDirectiveAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Added.</Saved>

      <label className="flex w-36 flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <input name="name" className={INPUT} placeholder="spoiler" required />
        <span className="text-xs text-muted-foreground">
          1–16 letters or digits. Written <code>:::spoiler</code> as a block, or{" "}
          <code>:spoiler[…]</code> inline.
        </span>
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">Note</span>
        <input name="description" className={INPUT} />
        <span className="text-xs text-muted-foreground">For you. Never shown to members.</span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="block" value="1" className="size-4" />
        <span>Block</span>
      </label>

      <span className="min-w-28">
        <SubmitButton>Add</SubmitButton>
      </span>
    </form>
  )
}

export function DeleteAttachmentForm({ attachmentId }: { attachmentId: number }) {
  const [state, action] = useActionState(deleteAttachmentAction, EMPTY_STATE)

  return (
    <form action={action} className="shrink-0">
      <FormError message={state.error} />
      <input type="hidden" name="id" value={attachmentId} />
      <button type="submit" className="text-xs text-destructive hover:underline">
        Delete
      </button>
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
}: {
  forums: readonly ForumChoice[]
  values?: AnnouncementValues
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" defaultValue={values?.title ?? ''} className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Message</span>
        <textarea
          name="message"
          rows={5}
          defaultValue={values?.message ?? ''}
          className={INPUT}
          required
        />
        <span className="text-xs text-muted-foreground">
          Markdown, rendered the same way a post is — including this board&rsquo;s
          smilies and directives.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Where</span>
        <select
          name="forumId"
          defaultValue={values?.forumId === null || values === undefined ? '' : String(values.forumId)}
          className={INPUT}
        >
          <option value="">The whole board</option>
          {forums.map((forum) => (
            <option key={forum.id} value={forum.id}>
              {forum.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          A forum&rsquo;s announcement is shown to whoever can see that forum. A
          board-wide one is shown on the index and on every forum.
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">From</span>
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={values?.startsAtInput ?? ''}
            className={INPUT}
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Until</span>
          <input
            type="datetime-local"
            name="endsAt"
            defaultValue={values?.endsAtInput ?? ''}
            className={INPUT}
          />
          <span className="text-xs text-muted-foreground">Blank never expires.</span>
        </label>
      </div>

      { }
      <p className="text-xs text-muted-foreground">Times are UTC.</p>
    </>
  )
}

export function AnnouncementRowForm({
  announcement,
  forums,
}: {
  announcement: AnnouncementValues
  forums: readonly ForumChoice[]
}) {
  const [state, action] = useActionState(updateAnnouncementAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteAnnouncementAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-3 py-4">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>Saved.</Saved>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={announcement.id} />
        <AnnouncementFields forums={forums} values={announcement} />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value="1"
              defaultChecked={announcement.enabled}
              className="size-4"
            />
            <span>Enabled</span>
          </label>

          <span className="min-w-28">
            <SubmitButton>Save</SubmitButton>
          </span>
        </div>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={announcement.id} />
        <button type="submit" className="text-xs text-destructive hover:underline">
          Remove
        </button>
      </form>
    </div>
  )
}

export function NewAnnouncementForm({ forums }: { forums: readonly ForumChoice[] }) {
  const [state, action] = useActionState(createAnnouncementAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>Added.</Saved>

      <AnnouncementFields forums={forums} />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" value="1" defaultChecked className="size-4" />
          <span>Enabled</span>
        </label>

        <span className="min-w-28">
          <SubmitButton>Add</SubmitButton>
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

const ANSWERS_HINT =
  'One per line. Any of them is accepted, ignoring case and extra spaces.'

export function CaptchaQuestionRowForm({ question }: { question: CaptchaQuestionValues }) {
  const [state, action] = useActionState(updateCaptchaQuestionAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteCaptchaQuestionAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>Saved.</Saved>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={question.id} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Question</span>
          <input name="question" defaultValue={question.question} className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Accepted answers</span>
          <textarea
            name="answers"
            rows={3}
            defaultValue={question.answers.join('\n')}
            className={INPUT}
            required
          />
          <span className="text-xs text-muted-foreground">{ANSWERS_HINT}</span>
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
            <span>Enabled</span>
          </label>

          <span className="min-w-24">
            <SubmitButton>Save</SubmitButton>
          </span>
        </div>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={question.id} />
        <button type="submit" className="text-xs text-destructive hover:underline">
          Remove
        </button>
      </form>
    </div>
  )
}

export function NewCaptchaQuestionForm() {
  const [state, action] = useActionState(createCaptchaQuestionAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>Added.</Saved>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Question</span>
        <input
          name="question"
          className={INPUT}
          placeholder="What is the name of this forum?"
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Accepted answers</span>
        <textarea name="answers" rows={3} className={INPUT} required />
        <span className="text-xs text-muted-foreground">{ANSWERS_HINT}</span>
      </label>

      <span className="min-w-28">
        <SubmitButton>Add</SubmitButton>
      </span>
    </form>
  )
}
