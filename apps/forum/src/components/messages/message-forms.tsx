"use client"

/**
 * F60's forms.
 *
 * Client components only for `useActionState`, like every other form on the
 * board, and every one works with scripting off.
 *
 * The selection bar is F52's trick: the checkboxes sit inside the *listing*
 * markup and are associated with the bar's `<form>` by the `form` attribute, so
 * a native submit carries them. Nothing here reads a checkbox in JavaScript;
 * the bar would work identically with scripting disabled, which is the whole
 * point of doing it this way rather than with a controlled component.
 */
import { useActionState } from "react"

import { messageBulkAction, sendMessageAction } from "@/server/message-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { MarkdownEditor } from "../content/markdown-editor"

import { FormError } from "../auth/form-controls"

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const BUTTON =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const SECONDARY =
  "inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const CARD = "flex flex-col gap-4 rounded-lg border border-border bg-card p-5"

export function ComposeForm({
  to,
  subject,
  message,
  replyToId,
}: {
  to: string
  subject: string
  message: string
  replyToId: number | null
}) {
  const [state, action] = useActionState(sendMessageAction, EMPTY_STATE)

  /*
   * The submitted values win over the prefill. A send rejected for a bad
   * recipient name must come back with what was typed, not with the reply
   * template again — that is how somebody loses a long message.
   */
  const values = state.values ?? {}

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />
      {replyToId === null ? null : <input type="hidden" name="replyTo" value={replyToId} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">To</span>
        <input
          name="to"
          defaultValue={values["to"] ?? to}
          className={FIELD}
          autoComplete="off"
          required
        />
        <span className="text-xs text-muted-foreground">
          One or more usernames, separated by commas.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Bcc</span>
        <input name="bcc" defaultValue={values["bcc"] ?? ""} className={FIELD} autoComplete="off" />
        <span className="text-xs text-muted-foreground">
          Optional. These names are hidden from the other recipients.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Subject</span>
        <input
          name="subject"
          defaultValue={values["subject"] ?? subject}
          className={FIELD}
          maxLength={200}
          required
        />
      </label>

      {/*
        The same composer a post gets — toolbar, preview tab, formatting help —
        because a private message is written the same way and by the same
        people. `id` is distinct so a page holding both a message form and a
        reply form does not label one control twice.
      */}
      <MarkdownEditor
        id="message-body"
        required
        rows={12}
        defaultValue={values["message"] ?? message}
        hint="Markdown, the same as in a post."
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="receipt" className="size-4 rounded border-border" />
        <span>Tell me when it has been read</span>
      </label>

      <div>
        <button type="submit" className={BUTTON}>
          Send message
        </button>
      </div>
    </form>
  )
}

/**
 * The action bar for a folder.
 *
 * `formId` is the id every checkbox in the listing points at. It is passed in
 * rather than hard-coded here so the listing and the bar cannot disagree about
 * it — a mismatch is silent, and the symptom is a member ticking six boxes and
 * being told to select something.
 */
export function MessageActionBar({
  formId,
  folder,
}: {
  formId: string
  folder: "inbox" | "sent" | "trash"
}) {
  const [state, action] = useActionState(messageBulkAction, EMPTY_STATE)

  return (
    <form id={formId} action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="folder" value={folder} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">With selected:</span>

        {folder === "inbox" && (
          <>
            <button type="submit" name="command" value="read" className={SECONDARY}>
              Mark read
            </button>
            <button type="submit" name="command" value="unread" className={SECONDARY}>
              Mark unread
            </button>
          </>
        )}

        {folder === "trash" ? (
          <>
            <button type="submit" name="command" value="restore" className={SECONDARY}>
              Restore to inbox
            </button>
            <button type="submit" name="command" value="delete" className={SECONDARY}>
              Delete permanently
            </button>
            {/* Named separately because it acts on the whole folder rather than
                on a selection, and a member emptying the trash has not ticked
                anything. */}
            <button type="submit" name="command" value="empty" className={SECONDARY}>
              Empty trash
            </button>
          </>
        ) : (
          <button type="submit" name="command" value="trash" className={SECONDARY}>
            Move to trash
          </button>
        )}
      </div>
    </form>
  )
}
