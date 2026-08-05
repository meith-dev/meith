"use client"

/**
 * The edit form and the two visibility buttons (F41).
 *
 * Same shape as the composer: a client component only for `useActionState`, a
 * native `<form>` that works with scripting off, and no validation the server
 * does not repeat.
 *
 * Delete and restore are **separate forms**, not extra submit buttons on this
 * one. Two reasons, and both bite without JavaScript: a submit button inside
 * the edit form would carry the whole draft with it, so "delete" would mean
 * "save my unsaved changes, then delete"; and a form's default submission
 * (pressing Enter in the textarea) picks its *first* submit button, which must
 * never be the destructive one.
 */
import { useActionState } from "react"

import { deletePostAction, editPostAction, restorePostAction } from "@/server/content-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"
import { MarkdownEditor } from "./markdown-editor"

export function EditPostForm({
  threadId,
  postId,
  message,
  reason,
}: {
  threadId: number
  postId: number
  message: string
  reason: string | null
}) {
  const [state, action] = useActionState(editPostAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="threadId" value={threadId} />
      {/* Both ids are re-resolved by the action against the actor's matrix, so
          tampering with either buys a permission check, not a bypass. */}
      <input type="hidden" name="postId" value={postId} />

      {/* See `markdown-editor.tsx`. The `intent=preview` button below is the
          no-JavaScript route to the same render. */}
      <MarkdownEditor
        required
        defaultValue={state.values?.message ?? message}
        preview={state.notice === "preview" ? (state.preview ?? "") : undefined}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Reason for editing (optional)</span>
        <input
          type="text"
          name="reason"
          maxLength={200}
          defaultValue={state.values?.reason ?? reason ?? ""}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>Save changes</SubmitButton>
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

/** The destructive half, deliberately its own form and its own action. */
export function DeletePostForm({ threadId, postId }: { threadId: number; postId: number }) {
  const [state, action] = useActionState(deletePostAction, EMPTY_STATE)

  return (
    <form action={action} className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
      <FormError message={state.error} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="postId" value={postId} />
      <p className="text-sm text-muted-foreground">
        Deleting hides this post from the thread. A moderator can put it back.
      </p>
      <div>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Delete this post
        </button>
      </div>
    </form>
  )
}

export function RestorePostForm({ threadId, postId }: { threadId: number; postId: number }) {
  const [state, action] = useActionState(restorePostAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="postId" value={postId} />
      <p className="text-sm text-muted-foreground">
        This post is deleted. Restoring puts it back in the thread and back into the board&rsquo;s
        counts.
      </p>
      <div>
        <SubmitButton>Restore this post</SubmitButton>
      </div>
    </form>
  )
}
