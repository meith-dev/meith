"use client"

/**
 * The reply form (F40).
 *
 * Same shape as the composer, and for the same reasons: a client component only
 * for `useActionState`, a native `<form>` with JavaScript off, and no
 * validation the server does not repeat. The quote arrives as a prefilled
 * `defaultValue` from the server, so quoting works without scripting too — it
 * is a link to this page, not a button that edits a textarea.
 *
 * ## Two shapes, one form
 *
 * On `/thread/…/reply` this *is* the page, so it is open, roomy, and the only
 * thing there. Rendered inline under a thread it is the quick reply, and it was
 * taking more vertical space than the conversation above it: a twelve-row
 * textarea, a file picker, a subscribe checkbox and three buttons, unstyled and
 * always expanded, so a two-post thread was mostly composer.
 *
 * `collapsible` folds that into a disclosure — see `@meith/ui`'s `Disclosure`
 * for why it is `<details>` rather than a Base UI accordion, which comes down
 * to a board you cannot post to with scripting off. It also shrinks the
 * textarea, because a quick reply is a paragraph and the box can grow.
 *
 * **It opens itself when there is something to see.** A failed submit, a saved
 * draft, a preview, or a draft that was waiting when the page loaded: all of
 * them force `open`, which matters most with scripting *off*, where a failed
 * submit is a full page reload and the error would otherwise render inside a
 * panel that had reset to closed.
 */
import { useActionState, useEffect } from "react"

import { Alert, AlertDescription, Disclosure, buttonVariants, cn } from "@meith/ui"

import { createReplyAction } from "@/server/content-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import type { UploadLimits } from "@meith/attachments/limits"
import type { Draft } from "@meith/drafts"

import { AttachmentField } from "./attachment-field"
import { EditorToolbar } from "./editor-toolbar"
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
  /** F42. Null when this member may not attach here, or the board cannot. */
  attachmentLimits: UploadLimits | null
  draft: Draft | null
  /**
   * Fold the whole thing into a disclosure and shrink it. Set for the inline
   * quick reply under a thread; never for `/thread/…/reply`, which is a page
   * whose entire purpose is this form.
   */
  collapsible?: boolean
}) {
  const [state, action] = useActionState(createReplyAction, EMPTY_STATE)
  useEffect(() => {
    const field = document.getElementById("post-message") as HTMLTextAreaElement | null
    const quotes = JSON.parse(sessionStorage.getItem("multiquote") ?? "[]") as Array<{
      author: string
      message: string
    }>
    if (field === null || quotes.length === 0) return
    field.value = `${field.value}${field.value ? "\n\n" : ""}${quotes.map((quote) => `[quote=${quote.author}]${quote.message}[/quote]`).join("\n\n")}`
    sessionStorage.removeItem("multiquote")
  }, [])

  /*
   * No `encType` on the form: React renders a Server Action form as
   * `multipart/form-data` itself, and warns if you say so as well. That is
   * what carries F42's file input — with scripting off it is the rendered
   * HTML doing the work and not a handler, so the attribute has to be right
   * in the markup rather than set on submit.
   */
  const form = (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      {state.notice === "saved" && (
        <Alert tone="success">
          <AlertDescription>Draft saved.</AlertDescription>
        </Alert>
      )}

      {state.notice === "preview" && (
        <section
          aria-label="Preview"
          className="rounded-md border border-border bg-muted/40 px-3 py-2"
        >
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Preview
          </h2>
          {/*
            The renderer's own output (F36), produced on the server by the same
            function that renders the post — so what the preview shows is what
            the thread will show, rather than an approximation that drifts.
          */}
          <div
            className="prose-bb text-sm"
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

      {/*
        `htmlFor`, not a `<label>` wrapped around the whole group.

        A label's control is its **first labelable descendant**, and a
        `<button>` is labelable — so with the toolbar inside it, this label
        named the *Bold button* "Message" and left the textarea with no
        accessible name at all. It rendered identically, which is why it stood
        for as long as it did; the browser suite could not see it either,
        because the specs that reach a composer were being refused at
        registration by the anti-spam timing floor (see `e2e/support/database.ts`).
      */}
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="post-message" className="font-medium">
          Message
        </label>
        <EditorToolbar />
        <textarea
          id="post-message"
          name="message"
          /*
           * Six rows inline against twelve on the reply page. A quick reply is
           * a paragraph, the box scrolls, and the thread above it is the thing
           * somebody came to read.
           */
          rows={collapsible ? 6 : 12}
          required
          defaultValue={state.values?.message ?? draft?.message ?? prefill}
          className="rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      {attachmentLimits !== null && <AttachmentField limits={attachmentLimits} />}

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="subscribe" value="1" className="size-4 accent-primary" />
          <span>Notify me of replies</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/*
          The quick reply's submit sits in a row with two others, so it is
          sized to its label; on the reply page it is the page's action and
          takes the full width of a phone.
        */}
        <SubmitButton className={collapsible ? "w-auto" : "w-full sm:w-auto"}>
          Post reply
        </SubmitButton>
        <button
          type="submit"
          name="intent"
          value="preview"
          className={buttonVariants({ variant: "outline" })}
        >
          Preview
        </button>
        {/*
          Last and quietest of the three. It is the only one that does not
          publish anything, and with several submit buttons in one form the
          *first* is what Enter picks — which must be "Post reply".
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

  if (!collapsible) return form

  /* Anything worth reading forces the panel open. See this file's header. */
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
