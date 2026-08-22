'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  banMemberAction,
  clearSecondFactorAction,
  continueMassMailAction,
  liftBanAction,
  mergeStepAction,
  pruneMembersAction,
  pruneSelectedMembersAction,
  saveMemberAccountAction,
  saveSecondaryGroupsAction,
  setMemberStateAction,
  startMassMailAction,
} from '@/server/user-admin-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { AdminUndo } from './admin-undo'
import { INPUT, Saved } from './form-bits'

export interface GroupChoice {
  readonly id: number
  readonly title: string
}

export interface MassMailGroupChoice extends GroupChoice {
  readonly audience: number
}

export interface MemberAccountValues {
  readonly id: number
  readonly username: string
  readonly email: string
  readonly primaryGroupId: number
  readonly displayGroupId: number | null
}

export function MemberAccountForm({
  member,
  groups,
  copy,
}: {
  member: MemberAccountValues
  groups: readonly GroupChoice[]
  copy: Copy
}) {
  const [state, action] = useActionState(saveMemberAccountAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
      <input type="hidden" name="userId" value={member.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminUser.username')}</span>
          <input name="username" defaultValue={member.username} className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminUser.email')}</span>
          <input name="email" type="email" defaultValue={member.email} className={INPUT} required />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminUser.emailHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminUser.primaryGroup')}</span>
          <select
            name="primaryGroupId"
            defaultValue={String(member.primaryGroupId)}
            className={INPUT}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminUser.primaryGroupHint')}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'adminUser.displayGroup')}</span>
          <select
            name="displayGroupId"
            defaultValue={member.displayGroupId === null ? '' : String(member.displayGroupId)}
            className={INPUT}
          >
            <option value="">{fromCopy(copy, 'adminUser.sameAsPrimary')}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminUser.displayGroupHint')}
          </span>
        </label>
      </div>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.saveAccount')}</SubmitButton>
      </div>
    </form>
  )
}

export function MemberStateForm({
  userId,
  state: current,
  copy,
}: {
  userId: number
  state: string
  copy: Copy
}) {
  const [state, action] = useActionState(setMemberStateAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
      <AdminUndo undo={state.undo} copy={copy} />
      <input type="hidden" name="userId" value={userId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminUser.accountState')}</span>
        <select name="state" defaultValue={current} className={INPUT}>
          <option value="active">{fromCopy(copy, 'adminUser.state.active')}</option>
          <option value="awaiting_activation">
            {fromCopy(copy, 'adminUser.state.awaitingActivation')}
          </option>
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminUser.accountStateHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.saveState')}</SubmitButton>
      </div>
    </form>
  )
}

export function ClearSecondFactorForm({
  userId,
  enrolled,
  copy,
}: {
  userId: number
  enrolled: boolean
  copy: Copy
}) {
  const [state, action] = useActionState(clearSecondFactorAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'cleared'}>
        {fromCopy(copy, 'adminUser.secondFactorCleared')}
      </Saved>
      <input type="hidden" name="userId" value={userId} />

      <p className="text-sm text-muted-foreground">
        {fromCopy(copy, enrolled ? 'adminUser.secondFactorHeld' : 'adminUser.secondFactorNotHeld')}
      </p>

      {enrolled && (
        <>
          <div>
            <SubmitButton>{fromCopy(copy, 'adminUser.clearSecondFactor')}</SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminUser.secondFactorNote')}
          </p>
        </>
      )}
    </form>
  )
}

export function BanMemberForm({ userId, copy }: { userId: number; copy: Copy }) {
  const [state, action] = useActionState(banMemberAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'banned'}>{fromCopy(copy, 'adminUser.banned')}</Saved>
      <AdminUndo undo={state.undo} copy={copy} />
      <input type="hidden" name="userId" value={userId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminUser.banLength')}</span>
        <input type="number" name="days" min={1} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminUser.banLengthHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminUser.staffNote')}</span>
        <textarea name="reason" rows={2} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminUser.staffNoteHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminUser.publicReason')}</span>
        <textarea name="publicReason" rows={2} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminUser.publicReasonHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.banMember')}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'adminUser.banPasswordNote')}</p>
    </form>
  )
}

export function SecondaryGroupsForm({
  userId,
  groups,
  selected,
  primaryGroupId,
  copy,
}: {
  userId: number
  groups: readonly GroupChoice[]
  selected: readonly number[]
  primaryGroupId: number
  copy: Copy
}) {
  const [state, action] = useActionState(saveSecondaryGroupsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === 'saved'}>{fromCopy(copy, 'admin.saved')}</Saved>
      <AdminUndo undo={state.undo} copy={copy} />
      <input type="hidden" name="userId" value={userId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{fromCopy(copy, 'adminUser.additionalGroupsSr')}</legend>
        {groups.map((group) =>
          group.id === primaryGroupId ? (
            <p key={group.id} className="text-sm text-muted-foreground">
              {formatFromCopy(copy, 'adminUser.primaryGroupRow', { group: group.title })}
            </p>
          ) : (
            <label key={group.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="groupIds"
                value={group.id}
                defaultChecked={selected.includes(group.id)}
                className="size-4"
              />
              <span>{group.title}</span>
            </label>
          ),
        )}
      </fieldset>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.saveGroups')}</SubmitButton>
      </div>
    </form>
  )
}

export function MergeForm({
  fromUserId,
  toUserId,
  toUsername,
  posts,
  copy,
}: {
  fromUserId: number
  toUserId: number
  toUsername: string
  posts: number
  copy: Copy
}) {
  const [state, action] = useActionState(mergeStepAction, EMPTY_STATE)
  const remaining = state.values?.remaining

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />

      {state.notice === 'merged' && (
        <Saved when>{formatFromCopy(copy, 'adminUser.merged', { username: toUsername })}</Saved>
      )}
      {state.notice === 'more' && (
        <Saved when>
          {formatFromCopy(copy, 'adminUser.mergeMore', { count: Number(remaining ?? 0) })}
        </Saved>
      )}

      <input type="hidden" name="userId" value={fromUserId} />
      <input type="hidden" name="toUserId" value={toUserId} />

      <div>
        <SubmitButton>
          {state.notice === 'more'
            ? fromCopy(copy, 'adminUser.moveNextBatch')
            : formatFromCopy(copy, 'adminUser.mergeInto', { username: toUsername, count: posts })}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatFromCopy(copy, 'adminUser.mergeNote', { username: toUsername })}
      </p>
    </form>
  )
}

export function LiftBanForm({ userId, copy }: { userId: number; copy: Copy }) {
  const [state, action] = useActionState(liftBanAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <Saved when={state.notice === 'lifted'}>{fromCopy(copy, 'adminUser.lifted')}</Saved>
      <input type="hidden" name="userId" value={userId} />
      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.liftBan')}</SubmitButton>
      </div>
    </form>
  )
}

export function PruneForm({
  before,
  inactive,
  awaiting,
  copy,
}: {
  before: string
  inactive: string
  awaiting: boolean
  copy: Copy
}) {
  const [state, action] = useActionState(pruneMembersAction, EMPTY_STATE)
  const pruned = state.values?.pruned ?? '0'
  const remaining = state.values?.remaining ?? '0'

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />

      {state.notice === 'finished' && (
        <Saved when>
          {formatFromCopy(copy, 'adminUser.pruneFinished', { count: Number(pruned) })}
        </Saved>
      )}
      {state.notice === 'more' && (
        <Saved when>{formatFromCopy(copy, 'adminUser.pruneMore', { pruned, remaining })}</Saved>
      )}

      <input type="hidden" name="before" value={before} />
      <input type="hidden" name="inactive" value={inactive} />
      {awaiting && <input type="hidden" name="awaiting" value="1" />}

      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.pruneClose')}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'adminUser.prunePasswordNote')}
      </p>
    </form>
  )
}

export function SelectedPruneForm({ selection, copy }: { selection: string; copy: Copy }) {
  const [state, action] = useActionState(pruneSelectedMembersAction, EMPTY_STATE)
  const pruned = state.values?.pruned ?? '0'

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      {state.notice === 'finished' && (
        <Saved when>
          {formatFromCopy(copy, 'adminUser.pruneFinished', { count: Number(pruned) })}
        </Saved>
      )}
      <input type="hidden" name="selection" value={selection} />
      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.pruneClose')}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'adminUser.prunePasswordNote')}
      </p>
    </form>
  )
}

export function MassMailForm({
  groups,
  copy,
}: {
  groups: readonly MassMailGroupChoice[]
  copy: Copy
}) {
  const [state, action] = useActionState(startMassMailAction, EMPTY_STATE)
  const [continueState, continueAction] = useActionState(continueMassMailAction, EMPTY_STATE)

  const current = continueState.values?.massMailId ?? state.values?.massMailId
  const queued = continueState.values?.queued ?? state.values?.queued ?? '0'
  const notice = continueState.notice ?? state.notice

  if (current !== undefined && notice !== undefined) {
    return (
      <form action={continueAction} className="flex flex-col gap-3">
        <FormError message={continueState.error} />
        {notice === 'sent' ? (
          <Saved when>
            {formatFromCopy(copy, 'adminUser.mailQueuedAll', { count: Number(queued) })}
          </Saved>
        ) : (
          <Saved when>{formatFromCopy(copy, 'adminUser.mailQueuedMore', { queued })}</Saved>
        )}

        <input type="hidden" name="massMailId" value={current} />
        {notice !== 'sent' && (
          <div>
            <SubmitButton>{fromCopy(copy, 'adminUser.queueNextBatch')}</SubmitButton>
          </div>
        )}
      </form>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminUser.sendTo')}</span>
        <select name="targetGroupId" defaultValue="" className={INPUT}>
          <option value="">{fromCopy(copy, 'adminUser.everyMember')}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title} ({group.audience})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminUser.sendToHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminUser.subject')}</span>
        <input name="subject" className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminUser.message')}</span>
        <textarea name="body" rows={10} className={INPUT} required />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminUser.messageHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminUser.queueMessage')}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'adminUser.mailPasswordNote')}
      </p>
    </form>
  )
}
