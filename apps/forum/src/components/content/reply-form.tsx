"use client"

/**
 * The reply form (F40).
 *
 * Same shape as the composer, and for the same reasons: a client component only
 * for `useActionState`, a native `<form>` with JavaScript off, and no
 * validation the server does not repeat. The quote arrives as a prefilled
 * `defaultValue` from the server, so quoting works without scripting too — it
 * is a link to this page, not a button that edits a textarea.
 */
import { useActionState, useEffect } from "react"

import { createReplyAction } from "@/server/content-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import type { UploadLimits } from "@meith/attachments/limits"
import type { Draft } from '@meith/drafts'

import { AttachmentField } from "./attachment-field"
import { EditorToolbar } from './editor-toolbar'
import { FormError, SubmitButton } from "../auth/form-controls"

export function ReplyForm({
  threadId,
  seenLastPostId,
  prefill,
  canSubscribe,
  attachmentLimits,
  draft,
}: {
  threadId: number
  seenLastPostId: number | null
  prefill: string
  canSubscribe: boolean
  /** F42. Null when this member may not attach here, or the board cannot. */
  attachmentLimits: UploadLimits | null
  draft: Draft | null
}) {
  const [state, action] = useActionState(createReplyAction, EMPTY_STATE)
  useEffect(() => {
    const field = document.getElementById('post-message') as HTMLTextAreaElement | null
    const quotes = JSON.parse(sessionStorage.getItem('multiquote') ?? '[]') as Array<{ author: string; message: string }>
    if (field === null || quotes.length === 0) return
    field.value = `${field.value}${field.value ? '\n\n' : ''}${quotes.map((quote) => `[quote=${quote.author}]${quote.message}[/quote]`).join('\n\n')}`
    sessionStorage.removeItem('multiquote')
  }, [])

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
      {state.notice === 'saved' && <p role="status">Draft saved.</p>}
      {state.notice === "preview" && (
        <section
          aria-label="Preview"
          className="rounded-md border border-border bg-muted/40 px-3 py-2"
        >
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">Preview</h2>
          {/*
            The renderer's own output (F36), produced on the server by the same
            function that renders the post — so what the preview shows is what
            the thread will show, rather than an approximation that drifts.
          */}
          <div
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: state.preview ?? "" }}
          />
        </section>
      )}

      <input type="hidden" name="threadId" value={threadId} />
      {/*
        What the author had seen when this form was rendered. The action
        compares it with the thread's current last post to notice that somebody
        replied underneath them — a marker, never a lock: the reply is written
        either way.
      */}
      {seenLastPostId !== null && (
        <input
          type="hidden"
          name="seenLastPostId"
          value={state.values?.seenLastPostId ?? seenLastPostId}
        />
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Message</span>
        <EditorToolbar />
        <textarea
          id="post-message"
          name="message"
          rows={12}
          required
          defaultValue={state.values?.message ?? draft?.message ?? prefill}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>

      {attachmentLimits !== null && <AttachmentField limits={attachmentLimits} />}

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="subscribe" value="1" className="size-4" />
          <span>Notify me of replies</span>
        </label>
      )}

      <div className="flex flex-wrap gap-3">
        <SubmitButton>Post reply</SubmitButton>
        <button type="submit" name="intent" value="save_draft">Save draft</button>
        <button
          type="submit"
          name="intent"
          value="preview"
          className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Preview
        </button>
      </div>
    </form>
  )
}
