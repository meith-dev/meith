"use client"

/**
 * F67's forms.
 *
 * The *search* form is not here, and that is deliberate: it is a plain GET
 * form in the page, so the filter lives in the address bar. It survives a
 * reload, it can be pasted to another administrator, and it needs neither
 * JavaScript nor a Server Action. Only the writes need this file.
 */
import { useActionState } from "react"

import {
  banMemberAction,
  liftBanAction,
  saveMemberAccountAction,
  setMemberStateAction,
} from "@/server/user-admin-actions"
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

export interface GroupChoice {
  readonly id: number
  readonly title: string
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
            /* F20: the currently-selected option, not a decision about it. */
            // eslint-disable-next-line no-restricted-properties -- F20: rendering the stored value, not deciding access
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
        {/*
          Banned is not an option. It is not a state you set — F23 captures the
          group the member held so an expiring ban can restore it, and a member
          whose column says banned with no ban row behind it cannot be un-banned
          correctly.
        */}
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
