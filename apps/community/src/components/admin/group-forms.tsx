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
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
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
  copy,
  defaultValue,
  exclude,
  required = true,
  placeholder,
}: {
  name: string
  groups: readonly GroupOption[]
  copy: Copy
  defaultValue?: string | undefined
  exclude?: number | undefined
  required?: boolean
  placeholder?: string
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} className={INPUT} required={required}>
      <option value="">{placeholder ?? fromCopy(copy, 'adminGroup.select.placeholder')}</option>
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
  copy,
}: {
  group: GroupIdentityValues
  surfaces: { readonly light: SampleSurface; readonly dark: SampleSurface }
  copy: Copy
}) {
  const [state, action] = useActionState(saveGroupIdentityAction, EMPTY_STATE)
  const [light, setLight] = useState(group.nameColorLight)
  const [dark, setDark] = useState(group.nameColorDark)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
      <input type="hidden" name="groupId" value={group.id} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminGroup.title')}</span>
        <input name="title" defaultValue={group.title} className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminGroup.description')}</span>
        <textarea name="description" rows={2} defaultValue={group.description} className={INPUT} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminGroup.displayOrder')}</span>
        <input
          type="number"
          name="displayOrder"
          min={0}
          defaultValue={group.displayOrder}
          className={INPUT}
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{fromCopy(copy, 'adminGroup.nameColour')}</legend>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminGroup.nameColourHint')}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            [
              'light',
              fromCopy(copy, 'adminGroup.light'),
              light,
              setLight,
              surfaces.light,
              fromCopy(copy, 'adminGroup.nameColour.describesLight'),
            ] as const,
            [
              'dark',
              fromCopy(copy, 'adminGroup.dark'),
              dark,
              setDark,
              surfaces.dark,
              fromCopy(copy, 'adminGroup.nameColour.describesDark'),
            ] as const,
          ].map(([scheme, label, value, set, surface, describes]) => (
            <div key={scheme} className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">{label}</span>
              <OklchPicker
                name={scheme === 'dark' ? 'nameColorDark' : 'nameColorLight'}
                describes={describes}
                copy={copy}
                value={value}
                onChange={set}
              />
              <p
                className="rounded-md border border-border px-3 py-2 text-sm"
                style={{ backgroundColor: surface.background, color: surface.foreground }}
              >
                <span style={value === '' ? undefined : { color: value }}>
                  {group.title || fromCopy(copy, 'adminGroup.sampleMember')}
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
        <span>{fromCopy(copy, 'adminGroup.staffGroup')}</span>
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
          <span>{fromCopy(copy, 'adminGroup.pluginGrantable')}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminGroup.pluginGrantableHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminGroup.saveGroup')}</SubmitButton>
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
  copy,
}: {
  groupId: number
  cells: readonly PermissionCellValues[]
  copy: Copy
}) {
  const [state, action] = useActionState(saveGroupPermissionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
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
                    {fromCopy(copy, 'adminGroup.perm.tickedRestricted')}
                  </span>
                )}
                {cell.scope === 'forum' && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {fromCopy(copy, 'adminGroup.perm.forumDefault')}
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
        <SubmitButton>{fromCopy(copy, 'adminGroup.savePermissions')}</SubmitButton>
      </div>
    </form>
  )
}

export function CreateGroupForm({ groups, copy }: { groups: readonly GroupOption[]; copy: Copy }) {
  const [state, action] = useActionState(createGroupAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'created'}>{fromCopy(copy, 'admin.created')}</Saved>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.title')}</span>
          <input name="title" className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.key')}</span>
          <input name="key" className={INPUT} required />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminGroup.keyHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.copyPermissionsFrom')}</span>
          <GroupSelect name="copyFromGroupId" groups={groups} copy={copy} />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminGroup.copyPermissionsFromHint')}
          </span>
        </label>
      </div>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminGroup.createGroup')}</SubmitButton>
      </div>
    </form>
  )
}

export function DeleteGroupForm({
  groupId,
  groups,
  copy,
}: {
  groupId: number
  groups: readonly GroupOption[]
  copy: Copy
}) {
  const [state, action] = useActionState(deleteGroupAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'deleted'}>{fromCopy(copy, 'adminGroup.deleted')}</Saved>
      <input type="hidden" name="groupId" value={groupId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminGroup.moveMembersTo')}</span>
        <GroupSelect name="moveMembersTo" groups={groups} copy={copy} exclude={groupId} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminGroup.moveMembersToHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminGroup.deleteGroup')}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'adminGroup.deleteNote')}</p>
    </form>
  )
}

export function MoveMembersForm({ groups, copy }: { groups: readonly GroupOption[]; copy: Copy }) {
  const [state, action] = useActionState(moveMembersAction, EMPTY_STATE)

  const cursor = state.values?.afterUserId ?? '0'
  const movedSoFar = state.values?.movedSoFar ?? '0'
  const running = state.notice === 'more'

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      {state.notice === 'finished' && (
        <Saved when>
          {formatFromCopy(copy, 'adminGroup.move.finished', { count: Number(movedSoFar) })}
        </Saved>
      )}
      {running && (
        <Saved when>
          {formatFromCopy(copy, 'adminGroup.move.moreSoFar', { count: Number(movedSoFar) })}
        </Saved>
      )}

      <input type="hidden" name="afterUserId" value={running ? cursor : '0'} />
      <input type="hidden" name="movedSoFar" value={running ? movedSoFar : '0'} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.move.from')}</span>
          <GroupSelect
            name="fromGroupId"
            groups={groups}
            copy={copy}
            defaultValue={state.values?.fromGroupId}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.move.to')}</span>
          <GroupSelect
            name="toGroupId"
            groups={groups}
            copy={copy}
            defaultValue={state.values?.toGroupId}
          />
        </label>
      </div>

      <div>
        <SubmitButton>
          {running
            ? fromCopy(copy, 'adminGroup.move.nextBatch')
            : fromCopy(copy, 'adminGroup.move.start')}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'adminGroup.move.note')}</p>
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
  copy,
}: {
  groups: readonly GroupOption[]
  rule?: PromotionRuleValues
  copy: Copy
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.title')}</span>
          <input
            name="title"
            defaultValue={rule?.title ?? ''}
            className={INPUT}
            placeholder={fromCopy(copy, 'adminGroup.rule.titlePlaceholder')}
            required
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminGroup.rule.titleHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.displayOrder')}</span>
          <input
            type="number"
            name="displayOrder"
            min={0}
            defaultValue={rule?.displayOrder ?? '0'}
            className={INPUT}
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminGroup.rule.displayOrderHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.rule.promoteFrom')}</span>
          <GroupSelect
            name="fromPrimaryGroupId"
            groups={groups}
            copy={copy}
            defaultValue={rule?.fromPrimaryGroupId}
            required={false}
            placeholder={fromCopy(copy, 'adminGroup.rule.anyGroup')}
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminGroup.rule.promoteFromHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminGroup.rule.promoteInto')}</span>
          <GroupSelect
            name="toPrimaryGroupId"
            groups={groups}
            copy={copy}
            defaultValue={rule?.toPrimaryGroupId}
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminGroup.rule.promoteIntoHint')}
          </span>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">
          {fromCopy(copy, 'adminGroup.rule.thresholds')}
        </legend>
        <p className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminGroup.rule.thresholdsHint')}
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{fromCopy(copy, 'adminGroup.rule.posts')}</span>
            <input
              type="number"
              name="minPostCount"
              min={0}
              defaultValue={rule?.minPostCount ?? ''}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{fromCopy(copy, 'adminGroup.rule.reputation')}</span>
            <input
              type="number"
              name="minReputation"
              min={0}
              defaultValue={rule?.minReputation ?? ''}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{fromCopy(copy, 'adminGroup.rule.daysRegistered')}</span>
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
  copy,
}: {
  rule: PromotionRuleValues
  groups: readonly GroupOption[]
  copy: Copy
}) {
  const [state, action] = useActionState(updatePromotionRuleAction, EMPTY_STATE)
  const [toggleState, toggleAction] = useActionState(setPromotionRuleEnabledAction, EMPTY_STATE)
  const [removeState, removeAction] = useActionState(deletePromotionRuleAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-3 py-4">
      <FormError message={state.error ?? toggleState.error ?? removeState.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
      <Saved when={toggleState.notice === 'enabled'}>
        {fromCopy(copy, 'adminGroup.rule.enabledNotice')}
      </Saved>
      <Saved when={toggleState.notice === 'disabled'}>
        {fromCopy(copy, 'adminGroup.rule.disabledNotice')}
      </Saved>

      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="id" value={rule.id} />
        <PromotionRuleFields groups={groups} rule={rule} copy={copy} />

        <div>
          <SubmitButton>{fromCopy(copy, 'adminGroup.rule.save')}</SubmitButton>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-4">
        <form action={toggleAction} className="flex items-center">
          <input type="hidden" name="id" value={rule.id} />
          {!rule.enabled && <input type="hidden" name="enabled" value="1" />}
          <button type="submit" className="text-xs text-muted-foreground hover:underline">
            {rule.enabled
              ? fromCopy(copy, 'adminGroup.rule.disable')
              : fromCopy(copy, 'adminGroup.rule.enable')}
          </button>
        </form>

        <form action={removeAction} className="flex items-center">
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit" className="text-xs text-destructive hover:underline">
            {fromCopy(copy, 'admin.remove')}
          </button>
        </form>
      </div>
      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'adminGroup.rule.removeNote')}
      </p>
    </div>
  )
}

export function NewPromotionRuleForm({
  groups,
  copy,
}: {
  groups: readonly GroupOption[]
  copy: Copy
}) {
  const [state, action] = useActionState(createPromotionRuleAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'created'}>{fromCopy(copy, 'adminGroup.rule.added')}</Saved>

      <PromotionRuleFields groups={groups} copy={copy} />

      <div>
        <SubmitButton>{fromCopy(copy, 'adminGroup.rule.add')}</SubmitButton>
      </div>
    </form>
  )
}

export function ApplyPromotionsForm({ count, copy }: { count: number; copy: Copy }) {
  const [state, action] = useActionState(applyPromotionsAction, EMPTY_STATE)
  const promoted =
    state.notice?.startsWith('promoted:') === true ? state.notice.slice('promoted:'.length) : null

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      {promoted !== null && (
        <Saved when>
          {formatFromCopy(copy, 'adminGroup.apply.done', { count: Number(promoted) })}
        </Saved>
      )}

      <div>
        <SubmitButton>{formatFromCopy(copy, 'adminGroup.apply.promote', { count })}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'adminGroup.apply.note')}</p>
    </form>
  )
}
