"use client"

import { useActionState } from "react"

import type { MatrixCell, MatrixRow } from "@meith/authorization"

import {
  appointModeratorAction,
  copyForumPermissionsAction,
  createForumAction,
  moveForumAction,
  removeModeratorAction,
  saveForumOptionsAction,
  saveForumPermissionsAction,
} from "@/server/forum-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"
import { INPUT } from "./form-bits"

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
  readonly type: "category" | "forum" | "link"
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
          <div key={toggle.name} className="flex flex-col gap-0.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={toggle.name}
                value="1"
                defaultChecked={forum.flags[toggle.name] === true}
                className="size-4"
              />
              <span>{toggle.label}</span>
            </label>
            {toggle.name === "allowThreads" && forum.type === "category" && (
              <span className="ml-6 text-xs text-muted-foreground">
                A category holds forums. Turn this on and it holds threads of its own as
                well, and its page lists them under those forums. Turning it off again
                stops new ones and returns the page to the forums; threads already there
                keep their addresses.
              </span>
            )}
          </div>
        ))}
      </fieldset>

      <div>
        <SubmitButton>Save forum</SubmitButton>
      </div>
    </form>
  )
}

function effectiveValue(cell: MatrixCell): string {
  if (cell.kind === "boolean") return cell.effective ? "allowed" : "denied"
  if (cell.kind === "negative") return cell.effective ? "required" : "not required"
  return String(cell.effective)
}

function effectiveLabel(cell: MatrixCell, forumTitles: ReadonlyMap<number, string>): string {
  const value = effectiveValue(cell)

  if (cell.stored !== null) return `set here: ${value}`
  if (cell.inheritedFrom === null) return `inherited from the group's own default: ${value}`
  return `inherited from ${forumTitles.get(cell.inheritedFrom) ?? "an ancestor"}: ${value}`
}

function CellControl({ cell }: { cell: MatrixCell }) {
  if (cell.kind === "numeric") {
    return (
      <input
        type="number"
        name={cell.key}
        min={0}
        placeholder="Inherit"
        defaultValue={cell.control}
        className={INPUT}
      />
    )
  }

  const negative = cell.kind === "negative"
  return (
    <select name={cell.key} defaultValue={cell.control} className={INPUT}>
      <option value="inherit">Inherit</option>
      <option value="grant">{negative ? "Required" : "Grant"}</option>
      <option value="deny">{negative ? "Not required" : "Deny"}</option>
    </select>
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
        <h3 className="text-base font-semibold tracking-tight">{row.groupTitle}</h3>
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

function ParentSelect({
  name,
  parents,
  defaultValue,
}: {
  name: string
  parents: readonly { id: number; title: string; depth: number }[]
  defaultValue: string
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={INPUT}>
      <option value="">— top level —</option>
      {parents.map((parent) => (
        <option key={parent.id} value={parent.id}>
          {" ".repeat(parent.depth * 2)}
          {parent.title}
        </option>
      ))}
    </select>
  )
}

export function CreateForumForm({
  parents,
}: {
  parents: readonly { id: number; title: string; depth: number }[]
}) {
  const [state, action] = useActionState(createForumAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      {state.notice === "created" && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">Created.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Kind</span>
          <select name="type" defaultValue="forum" className={INPUT}>
            <option value="forum">Forum — holds threads</option>
            <option value="category">Category — a heading that holds forums</option>
            <option value="link">Link — redirects elsewhere</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Inside</span>
          <ParentSelect name="parentId" parents={parents} defaultValue="" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input name="title" className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Slug</span>
          <input name="slug" className={INPUT} required />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description</span>
        <input name="description" className={INPUT} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Link URL</span>
        <input name="linkUrl" className={INPUT} />
        <span className="text-xs text-muted-foreground">Only for a link row.</span>
      </label>

      <div>
        <SubmitButton>Create</SubmitButton>
      </div>
    </form>
  )
}

export function MoveForumForm({
  forumId,
  currentParentId,
  parents,
}: {
  forumId: number
  currentParentId: number | null
  parents: readonly { id: number; title: string; depth: number }[]
}) {
  const [state, action] = useActionState(moveForumAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      {state.notice === "moved" && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Moved. Its subforums came with it.
        </p>
      )}
      <input type="hidden" name="forumId" value={forumId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Move inside</span>
        <ParentSelect
          name="newParentId"
          parents={parents}
          defaultValue={currentParentId === null ? "" : String(currentParentId)}
        />
      </label>

      <div>
        <SubmitButton>Move forum</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Everything beneath this forum moves with it, and inherits from wherever
        it lands — so moving a busy forum under a private category hides its
        whole subtree. You will be asked for your password again.
      </p>
    </form>
  )
}

const RIGHT_LABELS: Record<string, string> = {
  canEditPosts: "Edit posts",
  canSoftDeletePosts: "Delete posts",
  canRestorePosts: "Restore posts",
  canApproveContent: "Approve content",
  canOpenCloseThreads: "Open and close threads",
  canStickThreads: "Stick threads",
  canMoveThreads: "Move threads",
  canMergeThreads: "Merge threads",
  canSplitThreads: "Split threads",
}

export interface ModeratorRow {
  readonly id: number
  readonly subject: string
  readonly cascadeToSubforums: boolean
  readonly rights: Readonly<Record<string, boolean>>
}

export function ModeratorsPanel({
  forumId,
  rights,
  moderators,
  groups,
}: {
  forumId: number
  rights: readonly string[]
  moderators: readonly ModeratorRow[]
  groups: readonly { groupId: number; title: string }[]
}) {
  const [appointState, appoint] = useActionState(appointModeratorAction, EMPTY_STATE)
  const [removeState, remove] = useActionState(removeModeratorAction, EMPTY_STATE)

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Moderators</h2>

      <FormError message={removeState.error} />
      {moderators.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody moderates this forum.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {moderators.map((moderator) => (
            <li key={moderator.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{moderator.subject}</span>
                <span className="text-xs text-muted-foreground">
                  {rights.filter((right) => moderator.rights[right] === true).length === 0
                    ? "No rights — can read the queue and nothing else"
                    : rights
                        .filter((right) => moderator.rights[right] === true)
                        .map((right) => RIGHT_LABELS[right] ?? right)
                        .join(", ")}
                  {moderator.cascadeToSubforums && " · also in subforums"}
                </span>
              </span>
              <form action={remove}>
                <input type="hidden" name="forumId" value={forumId} />
                <input type="hidden" name="appointmentId" value={moderator.id} />
                <button
                  type="submit"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={appoint} className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <FormError message={appointState.error} />
        {appointState.notice === "saved" && (
          <p className="text-sm text-muted-foreground">Saved.</p>
        )}
        <h3 className="text-sm font-medium">Appoint, or change what somebody may do</h3>
        <input type="hidden" name="forumId" value={forumId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Member</span>
            <input name="username" className={INPUT} placeholder="Username" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">…or a group</span>
            <select name="groupId" defaultValue="" className={INPUT}>
              <option value="">— none —</option>
              {groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          One or the other. Appointing somebody who already moderates here
          replaces what they may do.
        </p>

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="text-sm font-medium">May</legend>
          {rights.map((right) => (
            <label key={right} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={right} value="1" className="size-4" />
              <span>{RIGHT_LABELS[right] ?? right}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="cascadeToSubforums" value="1" className="size-4" />
          <span>Also in every forum beneath this one</span>
        </label>

        <div>
          <SubmitButton>Save appointment</SubmitButton>
        </div>
      </form>
    </section>
  )
}
