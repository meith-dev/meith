"use client"

import { useActionState } from "react"

import {
  banMemberAction,
  continueMassMailAction,
  liftBanAction,
  mergeStepAction,
  pruneMembersAction,
  saveMemberAccountAction,
  saveSecondaryGroupsAction,
  setMemberStateAction,
  startMassMailAction,
} from "@/server/user-admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"
import { INPUT, Saved } from "./form-bits"

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
}: {
  member: MemberAccountValues
  groups: readonly GroupChoice[]
}) {
  const [state, action] = useActionState(saveMemberAccountAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>
      <input type="hidden" name="userId" value={member.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Username</span>
          <input name="username" defaultValue={member.username} className={INPUT} required />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            name="email"
            type="email"
            defaultValue={member.email}
            className={INPUT}
            required
          />
          <span className="text-xs text-muted-foreground">
            Changing this does not re-verify it, and does not tell the member.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Primary group</span>
          <select
            name="primaryGroupId"
            // eslint-disable-next-line no-restricted-properties -- rendering the stored value, not deciding access
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
            Decides what they may do.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Display group</span>
          <select
            name="displayGroupId"
            defaultValue={member.displayGroupId === null ? "" : String(member.displayGroupId)}
            className={INPUT}
          >
            <option value="">— same as primary —</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Decides only the badge beside their name.
          </span>
        </label>
      </div>

      <div>
        <SubmitButton>Save account</SubmitButton>
      </div>
    </form>
  )
}

export function MemberStateForm({
  userId,
  state: current,
}: {
  userId: number
  state: string
}) {
  const [state, action] = useActionState(setMemberStateAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>
      <input type="hidden" name="userId" value={userId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Account state</span>
        <select name="state" defaultValue={current} className={INPUT}>
          <option value="active">Active</option>
          <option value="awaiting_activation">Awaiting activation</option>
        </select>
        <span className="text-xs text-muted-foreground">
          Banning is below, and is not a state change.
        </span>
      </label>

      <div>
        <SubmitButton>Save state</SubmitButton>
      </div>
    </form>
  )
}

export function BanMemberForm({ userId }: { userId: number }) {
  const [state, action] = useActionState(banMemberAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "banned"}>
        Banned. Their sessions have been revoked.
      </Saved>
      <input type="hidden" name="userId" value={userId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Length in days</span>
        <input type="number" name="days" min={1} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          Leave blank for a permanent ban. An expiring ban puts them back in the
          group they are in now, not in the default one.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Staff note</span>
        <textarea name="reason" rows={2} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          Never shown to them. This is where the reasoning goes.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Reason shown to them</span>
        <textarea name="publicReason" rows={2} className={INPUT} />
        <span className="text-xs text-muted-foreground">
          Shown when they try to log in. Blank says only that the account is
          banned.
        </span>
      </label>

      <div>
        <SubmitButton>Ban this member</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be asked for your password again. This revokes their sessions
        immediately.
      </p>
    </form>
  )
}

// eslint-disable-next-line no-restricted-properties -- the id whose checkbox is suppressed, not a decision about it
export function SecondaryGroupsForm({
  userId,
  groups,
  selected,
  primaryGroupId,
}: {
  userId: number
  groups: readonly GroupChoice[]
  selected: readonly number[]
  primaryGroupId: number
}) {
  const [state, action] = useActionState(saveSecondaryGroupsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <Saved when={state.notice === "saved"}>Saved.</Saved>
      <input type="hidden" name="userId" value={userId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Additional groups</legend>
        {groups.map((group) =>
          group.id === primaryGroupId ? (
            <p key={group.id} className="text-sm text-muted-foreground">
              {group.title} — their primary group, set above.
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
        <SubmitButton>Save groups</SubmitButton>
      </div>
    </form>
  )
}

export function MergeForm({
  fromUserId,
  toUserId,
  toUsername,
  posts,
}: {
  fromUserId: number
  toUserId: number
  toUsername: string
  posts: number
}) {
  const [state, action] = useActionState(mergeStepAction, EMPTY_STATE)
  const remaining = state.values?.remaining

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />

      {state.notice === "merged" && (
        <Saved when>
          Merged. Everything now belongs to {toUsername}, and this account has
          been closed.
        </Saved>
      )}
      {state.notice === "more" && (
        <Saved when>
          {remaining} post{remaining === "1" ? "" : "s"} still to move. Press
          again — the run picks up where it stopped.
        </Saved>
      )}

      <input type="hidden" name="userId" value={fromUserId} />
      <input type="hidden" name="toUserId" value={toUserId} />

      <div>
        <SubmitButton>
          {state.notice === "more"
            ? "Move the next batch"
            : `Merge into ${toUsername} (${posts} post${posts === 1 ? "" : "s"})`}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be asked for your password again. There is no undo: everything
        this account ever posted becomes {toUsername}&rsquo;s, its sessions are
        destroyed, and the account is closed.
      </p>
    </form>
  )
}

export function LiftBanForm({ userId }: { userId: number }) {
  const [state, action] = useActionState(liftBanAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />
      <Saved when={state.notice === "lifted"}>
        Lifted. They are back in the group they held when they were banned.
      </Saved>
      <input type="hidden" name="userId" value={userId} />
      <div>
        <SubmitButton>Lift this ban</SubmitButton>
      </div>
    </form>
  )
}

export function PruneForm({
  before,
  inactive,
  awaiting,
  total,
}: {
  before: string
  inactive: string
  awaiting: boolean
  total: number
}) {
  const [state, action] = useActionState(pruneMembersAction, EMPTY_STATE)
  const pruned = state.values?.pruned ?? "0"
  const remaining = state.values?.remaining ?? "0"

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError message={state.error} />

      {state.notice === "finished" && (
        <Saved when>Finished. {pruned} account{pruned === "1" ? "" : "s"} closed in this batch, and none are left.</Saved>
      )}
      {state.notice === "more" && (
        <Saved when>
          {pruned} closed, {remaining} still matching. Press again to continue.
        </Saved>
      )}

      <input type="hidden" name="before" value={before} />
      <input type="hidden" name="inactive" value={inactive} />
      {awaiting && <input type="hidden" name="awaiting" value="1" />}

      <div>
        <SubmitButton>
          Close {total > 500 ? "the first 500" : `${total}`} account
          {total === 1 ? "" : "s"}
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be asked for your password again. Accounts are closed rather
        than deleted, so a wrong date can be undone — but they disappear from
        the board immediately.
      </p>
    </form>
  )
}

export function MassMailForm({
  groups,
  audience,
}: {
  groups: readonly MassMailGroupChoice[]
  audience: number
}) {
  const [state, action] = useActionState(startMassMailAction, EMPTY_STATE)
  const [continueState, continueAction] = useActionState(continueMassMailAction, EMPTY_STATE)

  const current = continueState.values?.massMailId ?? state.values?.massMailId
  const queued = continueState.values?.queued ?? state.values?.queued ?? "0"
  const notice = continueState.notice ?? state.notice

  if (current !== undefined && notice !== undefined) {
    return (
      <form action={continueAction} className="flex flex-col gap-3">
        <FormError message={continueState.error} />
        {notice === "sent" ? (
          <Saved when>
            Queued for all {queued} member{queued === "1" ? "" : "s"}. They will
            go out as the queue drains.
          </Saved>
        ) : (
          <Saved when>
            {queued} queued so far, and there are more. Press again to continue.
          </Saved>
        )}

        <input type="hidden" name="massMailId" value={current} />
        {notice !== "sent" && (
          <div>
            <SubmitButton>Queue the next batch</SubmitButton>
          </div>
        )}
      </form>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Send to</span>
        <select name="targetGroupId" defaultValue="" className={INPUT}>
          <option value="">
            Every member with a verified address ({audience})
          </option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title} ({group.audience})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          A group means members who hold it as their primary group or as an
          additional one. The number beside each audience is how many members it
          would reach right now.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Subject</span>
        <input name="subject" className={INPUT} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Message</span>
        <textarea name="body" rows={10} className={INPUT} required />
        <span className="text-xs text-muted-foreground">
          Plain text. It is sent as written — there is no template and no
          unsubscribe link, so keep it to things every member needs to know.
        </span>
      </label>

      <div>
        <SubmitButton>Queue this message</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        You will be asked for your password again. An email cannot be unsent,
        and a mistake reaches everybody at once.
      </p>
    </form>
  )
}
