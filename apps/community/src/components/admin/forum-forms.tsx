'use client'

import { useActionState, useEffect, useState } from 'react'

import type { FieldMatrixCell, FieldMatrixRow, MatrixColumn } from '@meith/authorization'
import type { PermissionField } from '@meith/core'
import { cn } from '@meith/ui'

import { PANEL_CARD, PANEL_LIST, PANEL_NOTE, PANEL_ROW } from '@/components/shell/panel-list'
import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  appointModeratorAction,
  copyForumPermissionsAction,
  createForumAction,
  moveForumAction,
  removeModeratorAction,
  saveForumOptionsAction,
  saveForumPermissionMatrixAction,
} from '@/server/forum-admin-actions'

import { FormError, PendingButton, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { INPUT, Saved } from './form-bits'

const TOGGLES = [
  { name: 'isOpen', labelKey: 'adminForum.toggle.isOpen' },
  { name: 'allowThreads', labelKey: 'adminForum.toggle.allowThreads' },
  { name: 'allowReplies', labelKey: 'adminForum.toggle.allowReplies' },
  { name: 'allowPolls', labelKey: 'adminForum.toggle.allowPolls' },
  { name: 'allowAttachments', labelKey: 'adminForum.toggle.allowAttachments' },
  { name: 'requiresPrefix', labelKey: 'adminForum.toggle.requiresPrefix' },
  { name: 'moderateNewThreads', labelKey: 'adminForum.toggle.moderateNewThreads' },
  { name: 'moderateNewPosts', labelKey: 'adminForum.toggle.moderateNewPosts' },
] as const

export interface ForumOptionsValues {
  readonly id: number
  readonly type: 'category' | 'forum' | 'link'
  readonly title: string
  readonly slug: string
  readonly description: string
  readonly linkUrl: string
  readonly displayOrder: number
  readonly flags: Readonly<Record<string, boolean>>
}

export function ForumOptionsForm({ forum, copy }: { forum: ForumOptionsValues; copy: Copy }) {
  const [state, action] = useActionState(saveForumOptionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
      <input type="hidden" name="forumId" value={forum.id} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.title')}</span>
        <input name="title" defaultValue={forum.title} className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.slug')}</span>
        <input name="slug" defaultValue={forum.slug} className={INPUT} required />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminForum.slugHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.description')}</span>
        <textarea name="description" rows={3} defaultValue={forum.description} className={INPUT} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.linkUrl')}</span>
        <input name="linkUrl" defaultValue={forum.linkUrl} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminForum.linkUrlHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.displayOrder')}</span>
        <input
          type="number"
          name="displayOrder"
          min={0}
          defaultValue={forum.displayOrder}
          className={INPUT}
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminForum.displayOrderHint')}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{fromCopy(copy, 'adminForum.options')}</legend>
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
              <span>{fromCopy(copy, toggle.labelKey)}</span>
            </label>
            {toggle.name === 'allowThreads' && forum.type === 'category' && (
              <span className="ml-6 text-xs text-muted-foreground">
                {fromCopy(copy, 'adminForum.categoryThreadsHint')}
              </span>
            )}
          </div>
        ))}
      </fieldset>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminForum.saveForum')}</SubmitButton>
      </div>
    </form>
  )
}

function firstSentence(text: string): string {
  const at = text.indexOf('. ')
  return at === -1 ? text : text.slice(0, at + 1)
}

function effectiveValue(
  kind: PermissionField['kind'],
  effective: boolean | number,
  copy: Copy,
): string {
  if (kind === 'boolean')
    return effective
      ? fromCopy(copy, 'adminForum.perm.allowed')
      : fromCopy(copy, 'adminForum.perm.denied')
  if (kind === 'negative')
    return effective
      ? fromCopy(copy, 'adminForum.perm.required')
      : fromCopy(copy, 'adminForum.perm.notRequired')
  return String(effective)
}

function inheritedTitle(
  row: FieldMatrixRow,
  cell: FieldMatrixCell,
  forumTitles: ReadonlyMap<number, string>,
  copy: Copy,
): string {
  const value = effectiveValue(row.kind, cell.effective, copy)
  if (cell.inheritedFrom === null)
    return formatFromCopy(copy, 'adminForum.perm.inheritedDefault', { value })
  return formatFromCopy(copy, 'adminForum.perm.inheritedFrom', {
    forum: forumTitles.get(cell.inheritedFrom) ?? fromCopy(copy, 'adminForum.perm.ancestor'),
    value,
  })
}

const BOOLEAN_PERM_GROUPS: readonly {
  readonly labelKey: string
  readonly fields: readonly string[]
}[] = [
  {
    labelKey: 'adminForum.permGroup.viewing',
    fields: ['canView', 'canViewThreads', 'canViewOthersThreads', 'canSearch'],
  },
  {
    labelKey: 'adminForum.permGroup.posting',
    fields: [
      'canPostThreads',
      'canPostReplies',
      'canPostPolls',
      'canVotePolls',
      'canRateThreads',
      'canSubscribe',
    ],
  },
  {
    labelKey: 'adminForum.permGroup.ownContent',
    fields: ['canEditOwnPosts', 'canDeleteOwnPosts', 'canDeleteOwnThreads'],
  },
  {
    labelKey: 'adminForum.permGroup.moderation',
    fields: [
      'canEditOthersPosts',
      'canSoftDeletePosts',
      'canViewUnapproved',
      'canViewDeleted',
      'canApproveContent',
    ],
  },
  {
    labelKey: 'adminForum.permGroup.attachments',
    fields: ['canUploadAttachments', 'canDownloadAttachments'],
  },
  {
    labelKey: 'adminForum.permGroup.approvals',
    fields: ['requiresThreadApproval', 'requiresPostApproval', 'requiresApprovalOnEdit'],
  },
]

function groupFieldRows(
  rows: readonly FieldMatrixRow[],
  groups: readonly { readonly labelKey: string; readonly fields: readonly string[] }[],
): readonly { readonly labelKey: string; readonly rows: readonly FieldMatrixRow[] }[] {
  const byKey = new Map(rows.map((row) => [row.key, row]))
  const taken = new Set<string>()
  const sections = groups
    .map((group) => {
      const found = group.fields.flatMap((key) => {
        const row = byKey.get(key)
        if (row === undefined) return []
        taken.add(key)
        return [row]
      })
      return { labelKey: group.labelKey, rows: found }
    })
    .filter((section) => section.rows.length > 0)

  const leftover = rows.filter((row) => !taken.has(row.key))
  return leftover.length === 0
    ? sections
    : [...sections, { labelKey: 'adminForum.permGroup.other', rows: leftover }]
}

const SEGMENT =
  'flex-1 cursor-pointer px-2 py-1 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring'

function MatrixTriState({
  row,
  cell,
  groupTitle,
  forumTitles,
  copy,
}: {
  row: FieldMatrixRow
  cell: FieldMatrixCell
  groupTitle: string
  forumTitles: ReadonlyMap<number, string>
  copy: Copy
}) {
  const negative = row.kind === 'negative'
  const options = [
    {
      value: 'inherit',
      label: fromCopy(copy, 'adminForum.perm.inherit'),
      on: 'has-[:checked]:bg-secondary has-[:checked]:text-secondary-foreground',
    },
    {
      value: 'grant',
      label: negative
        ? fromCopy(copy, 'adminForum.perm.requiredOption')
        : fromCopy(copy, 'adminForum.perm.grant'),
      on: 'has-[:checked]:bg-primary has-[:checked]:text-primary-foreground',
    },
    {
      value: 'deny',
      label: negative
        ? fromCopy(copy, 'adminForum.perm.notRequiredOption')
        : fromCopy(copy, 'adminForum.perm.deny'),
      on: 'has-[:checked]:bg-destructive has-[:checked]:text-destructive-foreground',
    },
  ]

  const legend =
    cell.stored === null
      ? `${firstSentence(row.description)} — ${groupTitle}. ${inheritedTitle(row, cell, forumTitles, copy)}`
      : `${firstSentence(row.description)} — ${groupTitle}`

  return (
    <div className="flex flex-col gap-1">
      <fieldset className="flex w-28 shrink-0 divide-x divide-border overflow-hidden rounded-md border border-border">
        <legend className="sr-only">{legend}</legend>
        {options.map((option) => (
          <label key={option.value} className={cn(SEGMENT, option.on)}>
            <input
              type="radio"
              name={cell.name}
              value={option.value}
              defaultChecked={cell.control === option.value}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {cell.stored === null && (
        <span className="text-[10px] text-muted-foreground">
          {effectiveValue(row.kind, cell.effective, copy)}
        </span>
      )}
    </div>
  )
}

function MatrixNumericInput({
  row,
  cell,
  groupTitle,
  copy,
}: {
  row: FieldMatrixRow
  cell: FieldMatrixCell
  groupTitle: string
  copy: Copy
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="number"
        name={cell.name}
        min={0}
        placeholder={fromCopy(copy, 'adminForum.perm.inherit')}
        defaultValue={cell.control}
        aria-label={`${firstSentence(row.description)} — ${groupTitle}`}
        className={cn(INPUT, 'w-20')}
      />
      {cell.stored === null && (
        <span className="text-[10px] text-muted-foreground">
          {effectiveValue(row.kind, cell.effective, copy)}
        </span>
      )}
    </div>
  )
}

function MatrixSection({
  title,
  columns,
  rows,
  forumTitles,
  copy,
}: {
  title: string
  columns: readonly MatrixColumn[]
  rows: readonly FieldMatrixRow[]
  forumTitles: ReadonlyMap<number, string>
  copy: Copy
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-20 min-w-48 border-b border-border bg-card px-3 py-2 text-left font-medium"
              >
                {fromCopy(copy, 'adminForum.permission')}
              </th>
              {columns.map((column) => (
                <th
                  key={column.groupId}
                  scope="col"
                  className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {column.groupTitle}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="scroll-mt-16 scroll-mb-24 border-b border-border/60 last:border-b-0"
              >
                <th
                  scope="row"
                  title={row.description}
                  className="sticky left-0 z-10 border-r border-border/60 bg-card px-3 py-2 text-left align-top font-normal"
                >
                  {firstSentence(row.description)}
                </th>
                {row.cells.map((cell, index) => (
                  <td key={cell.groupId} className="px-2 py-2 align-top">
                    {row.kind === 'numeric' ? (
                      <MatrixNumericInput
                        row={row}
                        cell={cell}
                        groupTitle={columns[index]?.groupTitle ?? ''}
                        copy={copy}
                      />
                    ) : (
                      <MatrixTriState
                        row={row}
                        cell={cell}
                        groupTitle={columns[index]?.groupTitle ?? ''}
                        forumTitles={forumTitles}
                        copy={copy}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ForumPermissionMatrixForm({
  forumId,
  columns,
  fields,
  forumTitles,
  copy,
}: {
  forumId: number
  columns: readonly MatrixColumn[]
  fields: readonly FieldMatrixRow[]
  forumTitles: ReadonlyMap<number, string>
  copy: Copy
}) {
  const [state, action] = useActionState(saveForumPermissionMatrixAction, EMPTY_STATE)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (state.notice === 'saved') setDirty(false)
  }, [state])

  const booleanSections = groupFieldRows(
    fields.filter((field) => field.kind !== 'numeric'),
    BOOLEAN_PERM_GROUPS,
  )
  const numericFields = fields.filter((field) => field.kind === 'numeric')

  return (
    <form action={action} className="flex flex-col gap-6" onChange={() => setDirty(true)}>
      <FormError message={state.error} />
      <input type="hidden" name="forumId" value={forumId} />

      {booleanSections.map((section) => (
        <MatrixSection
          key={section.labelKey}
          title={fromCopy(copy, section.labelKey)}
          columns={columns}
          rows={section.rows}
          forumTitles={forumTitles}
          copy={copy}
        />
      ))}

      {numericFields.length > 0 && (
        <MatrixSection
          title={fromCopy(copy, 'adminForum.permGroup.numeric')}
          columns={columns}
          rows={numericFields}
          forumTitles={forumTitles}
          copy={copy}
        />
      )}

      <div className="sticky bottom-0 z-30 flex items-center gap-3 rounded-b-lg border-t border-border bg-card/95 px-4 py-3 supports-[backdrop-filter]:bg-card/80 supports-[backdrop-filter]:backdrop-blur">
        <SubmitButton className="w-auto">{fromCopy(copy, 'adminForum.saveMatrix')}</SubmitButton>
        {dirty ? (
          <span className="text-xs font-medium text-muted-foreground">
            {fromCopy(copy, 'adminForum.unsavedChanges')}
          </span>
        ) : (
          state.notice === 'saved' && (
            <span className="text-xs font-medium text-moderation-approved">
              {fromCopy(copy, 'admin.saved')}
            </span>
          )
        )}
      </div>
    </form>
  )
}

export function CopyPermissionsForm({
  forumId,
  changeCount,
  forumCount,
  copy,
}: {
  forumId: number
  changeCount: number
  forumCount: number
  copy: Copy
}) {
  const [state, action] = useActionState(copyForumPermissionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <Saved when={state.notice === 'copied'}>{fromCopy(copy, 'adminForum.copied')}</Saved>
      <input type="hidden" name="forumId" value={forumId} />
      <div>
        <SubmitButton>
          {formatFromCopy(copy, 'adminForum.copyTo', { count: forumCount, changes: changeCount })}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'adminForum.copyNote')}</p>
    </form>
  )
}

function ParentSelect({
  name,
  parents,
  defaultValue,
  copy,
}: {
  name: string
  parents: readonly { id: number; title: string; depth: number }[]
  defaultValue: string
  copy: Copy
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={INPUT}>
      <option value="">{fromCopy(copy, 'adminForum.topLevel')}</option>
      {parents.map((parent) => (
        <option key={parent.id} value={parent.id}>
          {' '.repeat(parent.depth * 2)}
          {parent.title}
        </option>
      ))}
    </select>
  )
}

export function CreateForumForm({
  parents,
  copy,
}: {
  parents: readonly { id: number; title: string; depth: number }[]
  copy: Copy
}) {
  const [state, action] = useActionState(createForumAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'created'}>{fromCopy(copy, 'admin.created')}</Saved>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminForum.kind')}</span>
          <select name="type" defaultValue="forum" className={INPUT}>
            <option value="forum">{fromCopy(copy, 'adminForum.kind.forum')}</option>
            <option value="category">{fromCopy(copy, 'adminForum.kind.category')}</option>
            <option value="link">{fromCopy(copy, 'adminForum.kind.link')}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminForum.inside')}</span>
          <ParentSelect name="parentId" parents={parents} defaultValue="" copy={copy} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminForum.title')}</span>
          <input name="title" className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminForum.slug')}</span>
          <input name="slug" className={INPUT} required />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.description')}</span>
        <input name="description" className={INPUT} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.linkUrl')}</span>
        <input name="linkUrl" className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminForum.linkOnlyHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'admin.create')}</SubmitButton>
      </div>
    </form>
  )
}

export function MoveForumForm({
  forumId,
  currentParentId,
  parents,
  copy,
}: {
  forumId: number
  currentParentId: number | null
  parents: readonly { id: number; title: string; depth: number }[]
  copy: Copy
}) {
  const [state, action] = useActionState(moveForumAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'moved'}>{fromCopy(copy, 'adminForum.moved')}</Saved>
      <input type="hidden" name="forumId" value={forumId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminForum.moveInside')}</span>
        <ParentSelect
          name="newParentId"
          parents={parents}
          defaultValue={currentParentId === null ? '' : String(currentParentId)}
          copy={copy}
        />
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminForum.moveForum')}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'adminForum.moveNote')}</p>
    </form>
  )
}

const RIGHT_LABEL_KEYS: Record<string, string> = {
  canEditPosts: 'adminForum.right.canEditPosts',
  canSoftDeletePosts: 'adminForum.right.canSoftDeletePosts',
  canRestorePosts: 'adminForum.right.canRestorePosts',
  canApproveContent: 'adminForum.right.canApproveContent',
  canOpenCloseThreads: 'adminForum.right.canOpenCloseThreads',
  canStickThreads: 'adminForum.right.canStickThreads',
  canMoveThreads: 'adminForum.right.canMoveThreads',
  canMergeThreads: 'adminForum.right.canMergeThreads',
  canSplitThreads: 'adminForum.right.canSplitThreads',
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
  copy,
}: {
  forumId: number
  rights: readonly string[]
  moderators: readonly ModeratorRow[]
  groups: readonly { groupId: number; title: string }[]
  copy: Copy
}) {
  const [appointState, appoint] = useActionState(appointModeratorAction, EMPTY_STATE)
  const [removeState, remove] = useActionState(removeModeratorAction, EMPTY_STATE)

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-semibold">
        {fromCopy(copy, 'adminForum.moderators')}
      </h2>

      <FormError message={removeState.error} />
      {moderators.length === 0 ? (
        <p className={PANEL_NOTE}>{fromCopy(copy, 'adminForum.noModerators')}</p>
      ) : (
        <ul className={PANEL_LIST}>
          {moderators.map((moderator) => (
            <li key={moderator.id} className={PANEL_ROW}>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{moderator.subject}</span>
                <span className="text-xs text-muted-foreground">
                  {rights.filter((right) => moderator.rights[right] === true).length === 0
                    ? fromCopy(copy, 'adminForum.noRights')
                    : rights
                        .filter((right) => moderator.rights[right] === true)
                        .map((right) => fromCopy(copy, RIGHT_LABEL_KEYS[right] ?? right))
                        .join(', ')}
                  {moderator.cascadeToSubforums &&
                    ` · ${fromCopy(copy, 'adminForum.alsoSubforums')}`}
                </span>
              </span>
              <form action={remove}>
                <input type="hidden" name="forumId" value={forumId} />
                <input type="hidden" name="appointmentId" value={moderator.id} />
                <PendingButton
                  showWorking
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {fromCopy(copy, 'admin.remove')}
                </PendingButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={appoint} className={PANEL_CARD}>
        <FormError message={appointState.error} />
        <Saved when={appointState.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
        <h3 className="text-sm font-medium">{fromCopy(copy, 'adminForum.appointTitle')}</h3>
        <input type="hidden" name="forumId" value={forumId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{fromCopy(copy, 'adminForum.member')}</span>
            <input
              name="username"
              className={INPUT}
              placeholder={fromCopy(copy, 'adminForum.usernamePlaceholder')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{fromCopy(copy, 'adminForum.orGroup')}</span>
            <select name="groupId" defaultValue="" className={INPUT}>
              <option value="">{fromCopy(copy, 'admin.none')}</option>
              {groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{fromCopy(copy, 'adminForum.appointNote')}</p>

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="text-sm font-medium">{fromCopy(copy, 'adminForum.may')}</legend>
          {rights.map((right) => (
            <label key={right} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={right} value="1" className="size-4" />
              <span>{fromCopy(copy, RIGHT_LABEL_KEYS[right] ?? right)}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="cascadeToSubforums" value="1" className="size-4" />
          <span>{fromCopy(copy, 'adminForum.cascade')}</span>
        </label>

        <div>
          <SubmitButton>{fromCopy(copy, 'adminForum.saveAppointment')}</SubmitButton>
        </div>
      </form>
    </section>
  )
}
