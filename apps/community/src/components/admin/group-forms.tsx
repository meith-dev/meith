'use client'

import { useActionState, useState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  applyPromotionsAction,
  createGroupAction,
  createPromotionRuleAction,
  deleteGroupAction,
  deletePromotionRuleAction,
  moveMembersAction,
  saveGroupIdentityAction,
  saveGroupPermissionsAction,
  setPromotionRuleEnabledAction,
  updatePromotionRuleAction,
} from '@/server/group-admin-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { INPUT, Saved } from './form-bits'
import { OklchPicker } from './oklch-picker'

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
  required = true,
  placeholder = '— choose a group —',
}: {
  name: string
  groups: readonly GroupOption[]
  defaultValue?: string | undefined
  exclude?: number | undefined
  required?: boolean
  placeholder?: string
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} className={INPUT} required={required}>
      <option value="">{placeholder}</option>
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
  readonly pluginGrantable: boolean
  readonly badgeToken: string
  readonly nameColorLight: string
  readonly nameColorDark: string
}

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
      <Saved when={state.notice === 'saved'}>Saved.</Saved>
      <input type="hidden" name="groupId" value={group.id} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" defaultValue={group.title} className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description</span>
        <textarea name="description" rows={2} defaultValue={group.description} className={INPUT} />
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

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Name colour</legend>
        <p className="text-xs text-muted-foreground">
          Shown wherever a member of this group is named — postbits, thread listings, the online
          list. Leave a picker empty and their name is the ordinary text colour, which is what every
          name does by default.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['light', 'Light', light, setLight, surfaces.light] as const,
            ['dark', 'Dark', dark, setDark, surfaces.dark] as const,
          ].map(([scheme, label, value, set, surface]) => (
            <div key={scheme} className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">{label}</span>
              <OklchPicker
                name={scheme === 'dark' ? 'nameColorDark' : 'nameColorLight'}
                describes={`the ${label.toLowerCase()} name colour`}
                value={value}
                onChange={set}
              />
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

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          <input
            type="checkbox"
            name="pluginGrantable"
            value="1"
            defaultChecked={group.pluginGrantable}
            className="size-4"
          />
          <span>May be granted by plugins</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Lets an installed plugin put members in this group for a limited time — a paid pass, a
          trial. Refused for system and staff groups, and for any group whose permissions carry
          administrative or moderation power. Membership a plugin grants always expires. A plugin
          may ask for the group to become the member&rsquo;s primary one, which is what a plugin
          selling membership normally wants: the group they were primary in becomes a secondary
          membership and comes back the moment the grant is revoked or lapses. A staff
          member&rsquo;s primary group is never displaced — staff is appointed, and a purchase
          cannot move it.
        </span>
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
  readonly kind: 'boolean' | 'numeric' | 'negative'
  readonly scope: 'global' | 'forum'
  readonly value: boolean | number
}

function PermissionControl({ cell }: { cell: PermissionCellValues }) {
  if (cell.kind === 'numeric') {
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
      <Saved when={state.notice === 'saved'}>Saved.</Saved>
      <input type="hidden" name="groupId" value={groupId} />

      <div className="flex flex-col divide-y divide-border">
        {cells.map((cell) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: PermissionControl is the control, rendered behind the numeric-cell branch
          <label key={cell.key} className="flex items-start gap-3 py-3 text-sm">
            {cell.kind === 'numeric' ? null : <PermissionControl cell={cell} />}
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-medium">
                <code className="text-xs">{cell.key}</code>
                {cell.kind === 'negative' && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ticked = restricted
                  </span>
                )}
                {cell.scope === 'forum' && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    default for every forum
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{cell.description}</span>
              {cell.kind === 'numeric' && (
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
      <Saved when={state.notice === 'created'}>Created.</Saved>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input name="title" className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Key</span>
          <input name="key" className={INPUT} required />
          <span className="text-xs text-muted-foreground">
            How code refers to the group. Lower-case letters, numbers and underscores; it cannot be
            changed afterwards.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Copy permissions from</span>
          <GroupSelect name="copyFromGroupId" groups={groups} />
          <span className="text-xs text-muted-foreground">
            Required. Starting from the defaults would deny everything, which makes a group whose
            members cannot see the board.
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
      <Saved when={state.notice === 'deleted'}>
        Deleted. Its members are in the group you chose.
      </Saved>
      <input type="hidden" name="groupId" value={groupId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Move its members to</span>
        <GroupSelect name="moveMembersTo" groups={groups} exclude={groupId} />
        <span className="text-xs text-muted-foreground">
          Required — every member has a primary group, so there is nowhere for them to be left.
        </span>
      </label>

      <div>
        <SubmitButton>Delete this group</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be asked for your password again. This changes what every member it holds is
        allowed to do, and there is no undo.
      </p>
    </form>
  )
}

export function MoveMembersForm({ groups }: { groups: readonly GroupOption[] }) {
  const [state, action] = useActionState(moveMembersAction, EMPTY_STATE)

  const cursor = state.values?.afterUserId ?? '0'
  const movedSoFar = state.values?.movedSoFar ?? '0'
  const running = state.notice === 'more'

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      {state.notice === 'finished' && (
        <Saved when>
          Finished. {movedSoFar} member{movedSoFar === '1' ? '' : 's'} moved.
        </Saved>
      )}
      {running && (
        <Saved when>
          {movedSoFar} moved so far — there are more. Press again to continue; the run picks up
          where it stopped.
        </Saved>
      )}

      <input type="hidden" name="afterUserId" value={running ? cursor : '0'} />
      <input type="hidden" name="movedSoFar" value={running ? movedSoFar : '0'} />

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
          <GroupSelect name="toGroupId" groups={groups} defaultValue={state.values?.toGroupId} />
        </label>
      </div>

      <div>
        <SubmitButton>{running ? 'Move the next batch' : 'Start moving'}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Moves up to 500 members per press, so the board stays responsive while a long run works
        through. You will be asked for your password again.
      </p>
    </form>
  )
}

export interface PromotionRuleValues {
  readonly id: number
  readonly title: string
  readonly enabled: boolean
  readonly displayOrder: string
  readonly minPostCount: string
  readonly minReputation: string
  readonly minDaysRegistered: string
  readonly fromPrimaryGroupId: string
  readonly toPrimaryGroupId: string
}

function PromotionRuleFields({
  groups,
  rule,
}: {
  groups: readonly GroupOption[]
  rule?: PromotionRuleValues
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Title</span>
          <input
            name="title"
            defaultValue={rule?.title ?? ''}
            className={INPUT}
            placeholder="Veteran"
            required
          />
          <span className="text-xs text-muted-foreground">
            Names the rule in the preview and in the admin log. Members never see it.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Display order</span>
          <input
            type="number"
            name="displayOrder"
            min={0}
            defaultValue={rule?.displayOrder ?? '0'}
            className={INPUT}
          />
          <span className="text-xs text-muted-foreground">
            The first rule in this order that matches a member is the one applied.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Promote from</span>
          <GroupSelect
            name="fromPrimaryGroupId"
            groups={groups}
            defaultValue={rule?.fromPrimaryGroupId}
            required={false}
            placeholder="Any group"
          />
          <span className="text-xs text-muted-foreground">
            Their primary group. Any group considers every member the guards allow.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Promote into</span>
          <GroupSelect
            name="toPrimaryGroupId"
            groups={groups}
            defaultValue={rule?.toPrimaryGroupId}
          />
          <span className="text-xs text-muted-foreground">
            Becomes their primary and display group.
          </span>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">They must have at least</legend>
        <p className="text-xs text-muted-foreground">
          Blank means the rule does not look at that number. At least one has to be filled in — a
          rule with none matches every member it examines.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Posts</span>
            <input
              type="number"
              name="minPostCount"
              min={0}
              defaultValue={rule?.minPostCount ?? ''}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Reputation</span>
            <input
              type="number"
              name="minReputation"
              min={0}
              defaultValue={rule?.minReputation ?? ''}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Days registered</span>
            <input
              type="number"
              name="minDaysRegistered"
              min={0}
              defaultValue={rule?.minDaysRegistered ?? ''}
              className={INPUT}
            />
          </label>
        </div>
      </fieldset>
    </>
  )
}

export function PromotionRuleRowForm({
  rule,
  groups,
}: {
  rule: PromotionRuleValues
  groups: readonly GroupOption[]
}) {
  const [state, action] = useActionState(updatePromotionRuleAction, EMPTY_STATE)
  const [toggleState, toggleAction] = useActionState(setPromotionRuleEnabledAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deletePromotionRuleAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-3 py-4">
      <FormError message={state.error ?? toggleState.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>Saved.</Saved>
      <Saved when={toggleState.notice === 'enabled'}>
        Enabled. The scheduled task will apply it.
      </Saved>
      <Saved when={toggleState.notice === 'disabled'}>
        Disabled. It stays here and is skipped.
      </Saved>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={rule.id} />
        <PromotionRuleFields groups={groups} rule={rule} />

        <div>
          <SubmitButton>Save rule</SubmitButton>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-4">
        <form action={toggleAction} className="flex items-center">
          <input type="hidden" name="id" value={rule.id} />
          {!rule.enabled && <input type="hidden" name="enabled" value="1" />}
          <button type="submit" className="text-xs text-muted-foreground hover:underline">
            {rule.enabled ? 'Disable this rule' : 'Enable this rule'}
          </button>
        </form>

        <form action={removeAction} className="flex items-center">
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit" className="text-xs text-destructive hover:underline">
            Remove
          </button>
        </form>
      </div>
      <p className="text-xs text-muted-foreground">
        Removing asks for your password again. Disabling does not, and is the reversible way to stop
        a rule.
      </p>
    </div>
  )
}

export function NewPromotionRuleForm({ groups }: { groups: readonly GroupOption[] }) {
  const [state, action] = useActionState(createPromotionRuleAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'created'}>Added. It is enabled straight away.</Saved>

      <PromotionRuleFields groups={groups} />

      <div>
        <SubmitButton>Add rule</SubmitButton>
      </div>
    </form>
  )
}

export function ApplyPromotionsForm({ count }: { count: number }) {
  const [state, action] = useActionState(applyPromotionsAction, EMPTY_STATE)
  const promoted =
    state.notice?.startsWith('promoted:') === true ? state.notice.slice('promoted:'.length) : null

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      {promoted !== null && (
        <Saved when>
          Done. {promoted} member{promoted === '1' ? '' : 's'} promoted.
        </Saved>
      )}

      <div>
        <SubmitButton>
          Promote {count} member{count === 1 ? '' : 's'}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Runs the same evaluation you are looking at, and writes its outcomes. You will be asked for
        your password again.
      </p>
    </form>
  )
}
