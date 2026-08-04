"use client"

/** F71's forms: word filters, thread prefixes, smilies and custom BBCode. */
import { useActionState } from "react"

import {
  createCustomTagAction,
  createPrefixAction,
  createSmileyAction,
  createWordFilterAction,
  deleteCustomTagAction,
  deletePrefixAction,
  deleteSmileyAction,
  deleteWordFilterAction,
  updateCustomTagAction,
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

/* ------------------------------------------------------------------ *
 * The board's BBCode vocabulary
 * ------------------------------------------------------------------ */

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

        {/*
          The image itself, at the size a post will show it. An operator
          checking a URL they pasted should not have to open a thread to find
          out whether it points at anything.
        */}
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

export interface CustomTagValues {
  readonly id: number
  readonly name: string
  readonly block: boolean
  readonly description: string | null
  readonly enabled: boolean
}

export function CustomTagRowForm({ tag }: { tag: CustomTagValues }) {
  const [state, action] = useActionState(updateCustomTagAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deleteCustomTagAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2 py-3">
      <FormError message={state.error ?? removeState.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>

      <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
        <input type="hidden" name="id" value={tag.id} />

        <label className="flex w-36 flex-col gap-1 text-sm">
          <span className="font-medium">Tag</span>
          <input name="name" defaultValue={tag.name} className={INPUT} required />
        </label>

        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Note</span>
          <input name="description" defaultValue={tag.description ?? ""} className={INPUT} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="block"
            value="1"
            defaultChecked={tag.block}
            className="size-4"
          />
          <span>Block</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={tag.enabled}
            className="size-4"
          />
          <span>Enabled</span>
        </label>

        <span className="min-w-24">
          <SubmitButton>Save</SubmitButton>
        </span>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="id" value={tag.id} />
        <button type="submit" className="text-xs text-destructive hover:underline">
          Remove
        </button>
      </form>
    </div>
  )
}

export function NewCustomTagForm() {
  const [state, action] = useActionState(createCustomTagAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Added.</Saved>

      <label className="flex w-36 flex-col gap-1 text-sm">
        <span className="font-medium">Tag</span>
        <input name="name" className={INPUT} placeholder="spoiler" required />
        <span className="text-xs text-muted-foreground">1–16 letters or digits.</span>
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
