"use client"

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
  attachmentLimits: UploadLimits | null
  draft: Draft | null
}) {
  const [state, action] = useActionState(createThreadAction, EMPTY_STATE)

  const hasPollDraft =
    (state.values?.pollQuestion ?? "") !== "" || (state.values?.pollOption ?? "") !== ""

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {state.notice === "saved" && <p role="status">Draft saved.</p>}
      { }
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

      { }
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
        { }
        <button
          type="submit"
          name="intent"
          value="preview"
          className={buttonVariants({ variant: "outline" })}
        >
          Preview
        </button>
        { }
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
