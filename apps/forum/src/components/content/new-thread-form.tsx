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
 */
import { useActionState } from "react"

import { createThreadAction } from "@/server/content-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

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
}: {
  forumId: number
  prefixes: readonly PrefixOption[]
  requiresPrefix: boolean
  canSubscribe: boolean
}) {
  const [state, action] = useActionState(createThreadAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {state.notice === "preview" && (
        <section
          aria-label="Preview"
          className="rounded-md border border-border bg-muted/40 px-3 py-2"
        >
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">Preview</h2>
          {/*
            Rendered as text, not HTML. Until F36 there is no BBCode renderer
            and no sanitiser, and a preview that interpreted markup would be
            the one place on the board where a user's raw input reaches the DOM
            unescaped — from their own draft, but a stored draft is one feature
            away from someone else's.
          */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {state.values?.message}
          </p>
        </section>
      )}
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
        defaultValue={state.values?.title}
      />

      {prefixes.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Prefix{requiresPrefix ? "" : " (optional)"}</span>
          <select
            name="prefixId"
            defaultValue={state.values?.prefixId ?? ""}
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

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Message</span>
        <textarea
          id="post-message"
          name="message"
          rows={12}
          required
          defaultValue={state.values?.message}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>

      {canSubscribe && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="subscribe" value="1" className="size-4" />
          <span>Notify me of replies</span>
        </label>
      )}

      <div className="flex flex-wrap gap-3">
        <SubmitButton>Post thread</SubmitButton>
        {/*
          Preview is a second submit button on the same form, not a separate
          one: a form with two actions loses whichever the browser did not send,
          and `intent` is how the action tells them apart with JS off.
        */}
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
