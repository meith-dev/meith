"use client"

/**
 * F65's forms.
 *
 * The matrix is one form **per group row**, not one form for the whole grid.
 * That is the safety property: a save rewrites exactly the row an operator was
 * reading, and cannot silently rewrite rows they scrolled past. It also keeps
 * each submission to one group's worth of fields rather than groups × fields.
 */
import { useActionState } from "react"

import type { MatrixCell, MatrixRow } from "@forum/authorization"

import {
  copyForumPermissionsAction,
  saveForumOptionsAction,
  saveForumPermissionsAction,
} from "@/server/forum-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const TOGGLES = [
  { name: "isOpen", label: "Open for posting" },
  { name: "allowThreads", label: "Allow new threads" },
  { name: "allowReplies", label: "Allow replies" },
  { name: "allowPolls", label: "Allow polls" },
  { name: "allowAttachments", label: "Allow attachments" },
  { name: "requiresPrefix", label: "Require a thread prefix" },
  { name: "moderateNewThreads", label: "Hold new threads for approval" },
  { name: "moderateNewPosts", label: "Hold new replies for approval" },
] as const

export interface ForumOptionsValues {
  readonly id: number
  readonly title: string
  readonly slug: string
  readonly description: string
  readonly linkUrl: string
  readonly displayOrder: number
  readonly flags: Readonly<Record<string, boolean>>
}

export function ForumOptionsForm({ forum }: { forum: ForumOptionsValues }) {
  const [state, action] = useActionState(saveForumOptionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      {state.notice === "saved" && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">Saved.</p>
      )}
      <input type="hidden" name="forumId" value={forum.id} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" defaultValue={forum.title} className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Slug</span>
        <input name="slug" defaultValue={forum.slug} className={INPUT} required />
        <span className="text-xs text-muted-foreground">
          Appears in every link to this forum. Lower-case letters, numbers and
          single hyphens — anything else would have to be escaped, and a URL
          nobody can paste is worse than an ugly one.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={forum.description}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Link URL</span>
        <input name="linkUrl" defaultValue={forum.linkUrl} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          Only meaningful for a link row.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Display order</span>
        <input
          type="number"
          name="displayOrder"
          min={0}
          defaultValue={forum.displayOrder}
          className={INPUT}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Options</legend>
        {TOGGLES.map((toggle) => (
          <label key={toggle.name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={toggle.name}
              value="1"
              defaultChecked={forum.flags[toggle.name] === true}
              className="size-4"
            />
            <span>{toggle.label}</span>
          </label>
        ))}
      </fieldset>

      <div>
        <SubmitButton>Save forum</SubmitButton>
      </div>
    </form>
  )
}

/** How a cell's current state reads, given what it resolves to. */
function effectiveLabel(cell: MatrixCell, forumTitles: ReadonlyMap<number, string>): string {
  const value = cell.kind === "boolean" ? (cell.effective ? "allowed" : "denied") : String(cell.effective)

  if (cell.stored !== null) return `set here: ${value}`
  if (cell.inheritedFrom === null) return `inherited from the group's own default: ${value}`
  return `inherited from ${forumTitles.get(cell.inheritedFrom) ?? "an ancestor"}: ${value}`
}

function CellControl({ cell }: { cell: MatrixCell }) {
  if (cell.kind === "boolean") {
    const current = cell.stored === null ? "inherit" : cell.stored ? "grant" : "deny"
    return (
      <select name={cell.key} defaultValue={current} className={INPUT}>
        {/* Inherit first and default, because it is the correct answer for
            almost every cell — see `matrix-editor.ts`. */}
        <option value="inherit">Inherit</option>
        <option value="grant">Grant</option>
        <option value="deny">Deny</option>
      </select>
    )
  }

  return (
    <input
      type="number"
      name={cell.key}
      min={0}
      placeholder="Inherit"
      defaultValue={cell.stored === null ? "" : String(cell.stored)}
      className={INPUT}
    />
  )
}

export function ForumPermissionRowForm({
  forumId,
  row,
  forumTitles,
}: {
  forumId: number
  row: MatrixRow
  forumTitles: ReadonlyMap<number, string>
}) {
  const [state, action] = useActionState(saveForumPermissionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <FormError message={state.error} />
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-base font-semibold">{row.groupTitle}</h3>
        {state.notice === "saved" && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
      </div>

      <input type="hidden" name="forumId" value={forumId} />
      <input type="hidden" name="groupId" value={row.groupId} />

      <div className="grid gap-3 sm:grid-cols-2">
        {row.cells.map((cell) => (
          <label key={cell.key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{cell.description}</span>
            <CellControl cell={cell} />
            <span className="text-xs text-muted-foreground">
              {effectiveLabel(cell, forumTitles)}
            </span>
          </label>
        ))}
      </div>

      <div>
        <SubmitButton>Save {row.groupTitle}</SubmitButton>
      </div>
    </form>
  )
}

export function CopyPermissionsForm({
  forumId,
  changeCount,
  forumCount,
}: {
  forumId: number
  changeCount: number
  forumCount: number
}) {
  const [state, action] = useActionState(copyForumPermissionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      {state.notice === "copied" && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Copied. Every forum beneath this one now has the same permissions.
        </p>
      )}
      <input type="hidden" name="forumId" value={forumId} />
      <div>
        <SubmitButton>
          Copy to {forumCount} forum{forumCount === 1 ? "" : "s"} ({changeCount} change
          {changeCount === 1 ? "" : "s"})
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be asked for your password again. This rewrites forums you are
        not looking at and there is no undo.
      </p>
    </form>
  )
}
