"use client"

/**
 * The composer's controls (F39).
 *
 * A client component only for `useActionState`, which supplies the inline error
 * and re-fills the box after a rejected submit. With scripting off this is a
 * plain `<form>` posting to the same Server Action: the error then arrives as a
 * re-rendered page rather than in place, and nothing else changes. Nothing here
 * validates — the server does, because the server is the only place that can.
 *
 * It lives in the app rather than the theme because the form element carries a
 * Server Action reference, which never crosses the theme contract (D38/D42).
 * The theme renders the page around it.
 *
 * ## Its three buttons say which is which now
 *
 * "Save draft" was a bare `<button>`, which Tailwind's preflight renders as
 * plain body text — so the composer's action row read as a filled button, an
 * outlined button, and the word "Save draft" floating between them. The reply
 * form was fixed when it grew its accordion; this one was not, and the two
 * composers are the same act.
 *
 * The order is the order Enter picks. With several submits in one form the
 * browser sends the **first**, so "Post thread" is first, "Preview" second
 * because it is the other thing an author reaches for, and "Save draft" last
 * and quietest — it is the only one that publishes nothing.
 *
 * ## The poll is folded away
 *
 * Five always-visible fields for a feature most threads do not use, sitting
 * between the message box and the button that posts it. It is a `<details>`
 * (see `@meith/ui`'s `Disclosure` for why not a scripted accordion), open
 * whenever a submit came back with something in it — otherwise a rejected post
 * would hide the poll the author had just filled in.
 */
import { useActionState } from "react"

import { createThreadAction } from "@/server/content-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import type { UploadLimits } from "@meith/attachments/limits"
import type { Draft } from "@meith/drafts"

import { Disclosure, buttonVariants } from "@meith/ui"

import { AttachmentField } from "./attachment-field"
import { MarkdownEditor } from "./markdown-editor"
import { Field, FormError, SubmitButton } from "../auth/form-controls"

export interface PrefixOption {
  readonly id: number
  readonly label: string
}

export function NewThreadForm({
  forumId,
  prefixes,
  requiresPrefix,
  canSubscribe,
  canPostPoll,
  attachmentLimits,
  draft,
}: {
  forumId: number
  prefixes: readonly PrefixOption[]
  requiresPrefix: boolean
  canSubscribe: boolean
  canPostPoll: boolean
  /** F42. Null when this member may not attach here, or the board cannot. */
  attachmentLimits: UploadLimits | null
  draft: Draft | null
}) {
  const [state, action] = useActionState(createThreadAction, EMPTY_STATE)

  /*
   * Open the poll panel when a rejected submit brought poll text back with it,
   * or when the saved draft has some. Otherwise a failed post would fold away
   * the question the author had just typed, and it would look lost.
   *
   * `Field` re-fills from `state.values` by name, so these are the same keys
   * the inputs read.
   */
  const hasPollDraft =
    (state.values?.pollQuestion ?? "") !== "" || (state.values?.pollOption ?? "") !== ""

  /*
   * No `encType` on the form: React renders a Server Action form as
   * `multipart/form-data` itself, and warns if you say so as well. That is
   * what carries F42's file input — with scripting off it is the rendered
   * HTML doing the work and not a handler, so the attribute has to be right
   * in the markup rather than set on submit.
   */
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {state.notice === "saved" && <p role="status">Draft saved.</p>}
      {/* The forum is a hidden field rather than a route param the action
          trusts: the action re-resolves the matrix for whatever id arrives, so
          tampering with this buys a permission check, not a bypass. */}
      <input type="hidden" name="forumId" value={forumId} />

      <Field
        label="Subject"
        name="title"
        required
        minLength={3}
        maxLength={120}
        defaultValue={state.values?.title ?? draft?.title}
      />

      {prefixes.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Prefix{requiresPrefix ? "" : " (optional)"}</span>
          <select
            name="prefixId"
            defaultValue={state.values?.prefixId ?? draft?.prefixId?.toString() ?? ""}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="">{requiresPrefix ? "Choose a prefix…" : "None"}</option>
            {prefixes.map((prefix) => (
              <option key={prefix.id} value={prefix.id}>
                {prefix.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
        The composer owns its own label, formatting toolbar and preview tab —
        see `markdown-editor.tsx`, and in particular why none of that is in the
        server-rendered HTML. The `intent=preview` button below is what still
        works with scripting off, and `preview` is where its result comes back.
      */}
      <MarkdownEditor
        required
        defaultValue={state.values?.message ?? draft?.message}
        preview={state.notice === "preview" ? (state.preview ?? "") : undefined}
      />

      {attachmentLimits !== null && <AttachmentField limits={attachmentLimits} />}

      {canPostPoll && (
        <Disclosure
          summary="Add a poll"
          aside="Optional"
          contentClassName="flex flex-col gap-2"
          {...(hasPollDraft ? { open: true } : {})}
        >
          <Field label="Question" name="pollQuestion" maxLength={250} />
          {[1, 2, 3, 4].map((number) => (
            <Field key={number} label={`Option ${number}`} name="pollOption" maxLength={200} />
          ))}
        </Disclosure>
      )}

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="subscribe" value="1" className="size-4" />
          <span>Notify me of replies</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton className="w-auto">Post thread</SubmitButton>
        {/*
          Preview is a second submit button on the same form, not a separate
          one: a form with two actions loses whichever the browser did not send,
          and `intent` is how the action tells them apart with JS off.
        */}
        <button
          type="submit"
          name="intent"
          value="preview"
          className={buttonVariants({ variant: "outline" })}
        >
          Preview
        </button>
        {/*
          Last and quietest of the three. It is the only one that publishes
          nothing, and with several submits in one form the *first* is what
          Enter picks — which must be "Post thread".
        */}
        <button
          type="submit"
          name="intent"
          value="save_draft"
          className={buttonVariants({ variant: "ghost" })}
        >
          Save draft
        </button>
      </div>
    </form>
  )
}
