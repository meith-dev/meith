"use client"

/**
 * F66's forms.
 *
 * The permission editor is **one form for the whole group**, where F65's matrix
 * is one form per group row — and that difference is not inconsistency. F65's
 * screen edits several groups at once, so the unit of change has to be the row
 * an operator was reading; this screen edits one group, so the whole form *is*
 * that unit.
 *
 * Its cells are **two states, not three**. A group's global permissions are the
 * bottom of the resolution (R4.1 layer 1) and have no ancestor to inherit from,
 * so a third state would be an "inherit" that means nothing. Checkboxes are
 * therefore honest here in a way they would not be on a forum.
 */
import { useActionState, useState } from "react"

import {
  applyPromotionsAction,
  createGroupAction,
  deleteGroupAction,
  moveMembersAction,
  saveGroupIdentityAction,
  saveGroupPermissionsAction,
} from "@/server/group-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { OklchPicker } from "./oklch-picker"

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

/** A `<select>` of groups, shared by everything that has to name one. */
export interface GroupOption {
  readonly id: number
  readonly title: string
  readonly memberCount: number
}

function GroupSelect({
  name,
  groups,
  defaultValue,
  exclude,
}: {
  name: string
  groups: readonly GroupOption[]
  defaultValue?: string | undefined
  exclude?: number | undefined
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={INPUT} required>
      <option value="">— choose a group —</option>
      {groups
        .filter((group) => group.id !== exclude)
        .map((group) => (
          <option key={group.id} value={group.id}>
            {group.title} ({group.memberCount})
          </option>
        ))}
    </select>
  )
}

export interface GroupIdentityValues {
  readonly id: number
  readonly title: string
  readonly description: string
  readonly displayOrder: number
  readonly isStaffGroup: boolean
  readonly badgeToken: string
  /** The colour this group's members' names are shown in, per scheme. */
  readonly nameColorLight: string
  readonly nameColorDark: string
}

/** One preview surface, resolved by the server. See `boardSampleSurfaces`. */
export interface SampleSurface {
  readonly background: string
  readonly foreground: string
}

export function GroupIdentityForm({
  group,
  surfaces,
}: {
  group: GroupIdentityValues
  surfaces: { readonly light: SampleSurface; readonly dark: SampleSurface }
}) {
  const [state, action] = useActionState(saveGroupIdentityAction, EMPTY_STATE)
  const [light, setLight] = useState(group.nameColorLight)
  const [dark, setDark] = useState(group.nameColorDark)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>
      <input type="hidden" name="groupId" value={group.id} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" defaultValue={group.title} className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description</span>
        <textarea
          name="description"
          rows={2}
          defaultValue={group.description}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Display order</span>
        <input
          type="number"
          name="displayOrder"
          min={0}
          defaultValue={group.displayOrder}
          className={INPUT}
        />
      </label>

      {/*
        Two colours, and a sample of each against the surface it will really be
        on. A name colour picked against a white page is the commonest way to
        make half a board's members unreadable at night, and the only reliable
        cure is showing both while the choice is being made.
      */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Name colour</legend>
        <p className="text-xs text-muted-foreground">
          Shown wherever a member of this group is named — postbits, thread
          listings, the online list. Leave a picker empty and their name is the
          ordinary text colour, which is what every name does by default.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['light', 'Light', light, setLight, surfaces.light] as const,
              ['dark', 'Dark', dark, setDark, surfaces.dark] as const,
            ]
          ).map(([scheme, label, value, set, surface]) => (
            <div key={scheme} className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">{label}</span>
              <OklchPicker
                name={scheme === 'dark' ? 'nameColorDark' : 'nameColorLight'}
                value={value}
                onChange={set}
              />
              {/*
                The surface is painted from values the server resolved, not
                inherited from the page. Inheriting is wrong for exactly the
                administrator this feature exists for: the board declares its
                dark palette under a media query as well as a class, so on a
                machine set to dark mode an unclassed element *is* dark — and
                the sample labelled "Light" would be shown on black, which is
                the one thing it must never do.
              */}
              <p
                className="rounded-md border border-border px-3 py-2 text-sm"
                style={{ backgroundColor: surface.background, color: surface.foreground }}
              >
                <span style={value === '' ? undefined : { color: value }}>
                  {group.title || 'A member'}
                </span>
              </p>
            </div>
          ))}
        </div>
      </fieldset>

      {/*
        `badge_token` is still written because boards have values in it, and
        still read by nothing — see the note on the column. The badge that does
        render is an upload, on its own form below this one.
      */}
      <input type="hidden" name="badgeToken" value={group.badgeToken} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isStaffGroup"
          value="1"
          defaultChecked={group.isStaffGroup}
          className="size-4"
        />
        <span>Staff group — listed on the staff page</span>
      </label>

      <div>
        <SubmitButton>Save group</SubmitButton>
      </div>
    </form>
  )
}

export interface PermissionCellValues {
  readonly key: string
  readonly description: string
  readonly kind: "boolean" | "numeric" | "negative"
  readonly scope: "global" | "forum"
  readonly value: boolean | number
}

function PermissionControl({ cell }: { cell: PermissionCellValues }) {
  if (cell.kind === "numeric") {
    return (
      <input
        type="number"
        name={cell.key}
        min={0}
        defaultValue={String(cell.value)}
        className={INPUT}
      />
    )
  }

  return (
    <input
      type="checkbox"
      name={cell.key}
      value="1"
      defaultChecked={cell.value === true}
      className="mt-1 size-4 shrink-0"
    />
  )
}

export function GroupPermissionsForm({
  groupId,
  cells,
}: {
  groupId: number
  cells: readonly PermissionCellValues[]
}) {
  const [state, action] = useActionState(saveGroupPermissionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>
      <input type="hidden" name="groupId" value={groupId} />

      <div className="flex flex-col divide-y divide-border">
        {cells.map((cell) => (
          <label key={cell.key} className="flex items-start gap-3 py-3 text-sm">
            {cell.kind === "numeric" ? null : <PermissionControl cell={cell} />}
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">
                <code className="text-xs">{cell.key}</code>
                {cell.kind === "negative" && (
                  /*
                   * A negative field's `true` is a restriction, so a checkbox
                   * labelled with the description alone would read backwards.
                   */
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ticked = restricted
                  </span>
                )}
                {cell.scope === "forum" && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    default for every forum
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{cell.description}</span>
              {cell.kind === "numeric" && (
                <span className="max-w-xs">
                  <PermissionControl cell={cell} />
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <div>
        <SubmitButton>Save permissions</SubmitButton>
      </div>
    </form>
  )
}

export function CreateGroupForm({ groups }: { groups: readonly GroupOption[] }) {
  const [state, action] = useActionState(createGroupAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "created"}>Created.</Saved>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input name="title" className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Key</span>
          <input name="key" className={INPUT} required />
          <span className="text-xs text-muted-foreground">
            How code refers to the group. Lower-case letters, numbers and
            underscores; it cannot be changed afterwards.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Copy permissions from</span>
          <GroupSelect name="copyFromGroupId" groups={groups} />
          <span className="text-xs text-muted-foreground">
            Required. Starting from the defaults would deny everything, which
            makes a group whose members cannot see the board.
          </span>
        </label>
      </div>

      <div>
        <SubmitButton>Create group</SubmitButton>
      </div>
    </form>
  )
}

export function DeleteGroupForm({
  groupId,
  groups,
}: {
  groupId: number
  groups: readonly GroupOption[]
}) {
  const [state, action] = useActionState(deleteGroupAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "deleted"}>
        Deleted. Its members are in the group you chose.
      </Saved>
      <input type="hidden" name="groupId" value={groupId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Move its members to</span>
        <GroupSelect name="moveMembersTo" groups={groups} exclude={groupId} />
        <span className="text-xs text-muted-foreground">
          Required — every member has a primary group, so there is nowhere for
          them to be left.
        </span>
      </label>

      <div>
        <SubmitButton>Delete this group</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be asked for your password again. This changes what every
        member it holds is allowed to do, and there is no undo.
      </p>
    </form>
  )
}

/**
 * The chunked mass move.
 *
 * The cursor lives in a hidden field, so a run continues across presses with no
 * JavaScript at all — the action hands back where it stopped and the next
 * submission carries it. A single button that moved everybody would hold locks
 * on `users` for the whole run, on the table every request reads.
 */
export function MoveMembersForm({ groups }: { groups: readonly GroupOption[] }) {
  const [state, action] = useActionState(moveMembersAction, EMPTY_STATE)

  const cursor = state.values?.afterUserId ?? "0"
  const movedSoFar = state.values?.movedSoFar ?? "0"
  const running = state.notice === "more"

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      {state.notice === "finished" && (
        <Saved when>
          Finished. {movedSoFar} member{movedSoFar === "1" ? "" : "s"} moved.
        </Saved>
      )}
      {running && (
        <Saved when>
          {movedSoFar} moved so far — there are more. Press again to continue;
          the run picks up where it stopped.
        </Saved>
      )}

      <input type="hidden" name="afterUserId" value={running ? cursor : "0"} />
      <input type="hidden" name="movedSoFar" value={running ? movedSoFar : "0"} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">From</span>
          <GroupSelect
            name="fromGroupId"
            groups={groups}
            defaultValue={state.values?.fromGroupId}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">To</span>
          <GroupSelect
            name="toGroupId"
            groups={groups}
            defaultValue={state.values?.toGroupId}
          />
        </label>
      </div>

      <div>
        <SubmitButton>{running ? "Move the next batch" : "Start moving"}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Moves up to 500 members per press, so the board stays responsive while a
        long run works through. You will be asked for your password again.
      </p>
    </form>
  )
}

export function ApplyPromotionsForm({ count }: { count: number }) {
  const [state, action] = useActionState(applyPromotionsAction, EMPTY_STATE)
  const promoted = state.notice?.startsWith("promoted:") === true
    ? state.notice.slice("promoted:".length)
    : null

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      {promoted !== null && (
        <Saved when>
          Done. {promoted} member{promoted === "1" ? "" : "s"} promoted.
        </Saved>
      )}

      <div>
        <SubmitButton>
          Promote {count} member{count === 1 ? "" : "s"}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Runs the same evaluation you are looking at, and writes its outcomes.
        You will be asked for your password again.
      </p>
    </form>
  )
}
