"use client"

import { useActionState, useEffect } from "react"

import { Alert, AlertDescription, Disclosure, cn } from "@meith/ui"

import { createReplyAction, quotePostAction } from "@/server/content-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import type { UploadLimits } from "@meith/attachments/limits"
import type { Draft } from "@meith/drafts"

import { AttachmentField } from "./attachment-field"
import { ComposerIntents } from "./composer-intents"
import { MarkdownEditor } from "./markdown-editor"
import { FormError, SubmitButton } from "../auth/form-controls"

export function ReplyForm({
  threadId,
  seenLastPostId,
  prefill,
  canSubscribe,
  attachmentLimits,
  draft,
  collapsible = false,
}: {
  threadId: number
  seenLastPostId: number | null
  prefill: string
  canSubscribe: boolean
  attachmentLimits: UploadLimits | null
  draft: Draft | null
  collapsible?: boolean
}) {
  const [state, action] = useActionState(createReplyAction, EMPTY_STATE)

  useEffect(() => {
    const field = document.getElementById("post-message")
    const ids = (JSON.parse(sessionStorage.getItem("multiquote") ?? "[]") as unknown[])
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0)
    if (!(field instanceof HTMLTextAreaElement) || ids.length === 0) return
    sessionStorage.removeItem("multiquote")

    void (async () => {
      const quotes = (await Promise.all(ids.map((id) => quotePostAction(threadId, id)))).filter(
        (quote): quote is string => quote !== null,
      )
      if (quotes.length === 0) return
      const existing = field.value.replace(/\s+$/, "")
      field.value = `${existing === "" ? "" : `${existing}\n\n`}${quotes.join("\n\n")}\n\n`
      field.setSelectionRange(field.value.length, field.value.length)
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })()
  }, [threadId])

  const form = (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      {state.notice === "saved" && (
        <Alert tone="success">
          <AlertDescription>Draft saved.</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="threadId" value={threadId} />
      {seenLastPostId !== null && (
        <input
          type="hidden"
          name="seenLastPostId"
          value={state.values?.seenLastPostId ?? seenLastPostId}
        />
      )}

      <MarkdownEditor
        rows={collapsible ? 6 : 12}
        required
        defaultValue={state.values?.message ?? draft?.message ?? prefill}
        preview={state.notice === "preview" ? (state.preview ?? "") : undefined}
      />

      {attachmentLimits !== null && <AttachmentField limits={attachmentLimits} />}

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="subscribe" value="1" className="size-4 accent-primary" />
          <span>Notify me of replies</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton className={collapsible ? "w-auto" : "w-full sm:w-auto"}>
          Post reply
        </SubmitButton>
        <ComposerIntents />
      </div>
    </form>
  )

  if (!collapsible) return form

  const forceOpen = state.error !== undefined || state.notice !== undefined || draft !== null

  return (
    <Disclosure
      summary="Write a reply"
      aside={draft === null ? "Quick reply" : "Draft saved"}
      className={cn(forceOpen && "border-ring/40")}
      {...(forceOpen ? { open: true } : {})}
    >
      {form}
    </Disclosure>
  )
}
