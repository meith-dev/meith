"use client"

import { useActionState } from "react"

import {
  changePasswordAction,
  requestEmailChangeAction,
  saveOptionsAction,
  saveProfileAction,
  saveSignatureAction,
} from "@/server/usercp-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { MarkdownEditor } from "../content/markdown-editor"

import { FormError } from "../auth/form-controls"
import { CustomField, type CustomFieldInput } from "../profile/custom-field"

export type { CustomFieldInput }

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const BUTTON =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const CARD = "flex flex-col gap-4 rounded-lg border border-border bg-card p-5"

export function ProfileForm({
  location,
  website,
  bio,
  customFields = [],
}: {
  location: string
  website: string
  bio: string
  customFields?: readonly CustomFieldInput[]
}) {
  const [state, action] = useActionState(saveProfileAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Location</span>
        <input name="location" defaultValue={location} className={FIELD} maxLength={100} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Website</span>
        <input
          name="website"
          defaultValue={website}
          className={FIELD}
          maxLength={200}
          inputMode="url"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">About me</span>
        <textarea name="bio" defaultValue={bio} className={FIELD} rows={5} maxLength={1000} />
        <span className="text-xs text-muted-foreground">
          Plain text. Formatting is not applied here.
        </span>
      </label>

      {customFields.map((field) => (
        <CustomField key={field.key} field={field} className={FIELD} />
      ))}

      <div>
        <button type="submit" className={BUTTON}>
          Save profile
        </button>
      </div>
    </form>
  )
}

export function OptionsForm({
  timezone,
  timezones,
  postsPerPage,
  threadsPerPage,
  boardPostsPerPage,
  boardThreadsPerPage,
  invisible,
}: {
  timezone: string
  timezones: readonly string[]
  postsPerPage: string
  threadsPerPage: string
  boardPostsPerPage: number
  boardThreadsPerPage: number
  invisible: boolean
}) {
  const [state, action] = useActionState(saveOptionsAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Timezone</span>
        <select name="timezone" defaultValue={timezone} className={FIELD}>
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          Every date and time on the board is shown in this zone, and the footer
          says which one it is.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Posts per page</span>
        <input
          name="postsPerPage"
          defaultValue={postsPerPage}
          className={FIELD}
          inputMode="numeric"
          placeholder={`Board default (${boardPostsPerPage})`}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Threads per page</span>
        <input
          name="threadsPerPage"
          defaultValue={threadsPerPage}
          className={FIELD}
          inputMode="numeric"
          placeholder={`Board default (${boardThreadsPerPage})`}
        />
      </label>

      <p className="text-xs text-muted-foreground">
        Leave a page size empty to follow the board’s setting, so it keeps up
        when an administrator changes it.
      </p>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="invisible"
          defaultChecked={invisible}
          className="mt-1"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Browse invisibly</span>
          <span className="text-xs text-muted-foreground">
            You will not appear in the online list, and you will not be counted
            in it either. Your posts are unaffected, and moderators can still
            see that you are here.
          </span>
        </span>
      </label>

      <div>
        <button type="submit" className={BUTTON}>
          Save options
        </button>
      </div>
    </form>
  )
}

export function PasswordForm({ minLength }: { minLength: number }) {
  const [state, action] = useActionState(changePasswordAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">Change your password</h2>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Current password</span>
        <input
          type="password"
          name="currentPassword"
          className={FIELD}
          autoComplete="current-password"
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">New password</span>
        <input
          type="password"
          name="newPassword"
          className={FIELD}
          autoComplete="new-password"
          minLength={minLength}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">New password again</span>
        <input
          type="password"
          name="confirmPassword"
          className={FIELD}
          autoComplete="new-password"
          minLength={minLength}
          required
        />
      </label>

      <p className="text-xs text-muted-foreground">
        You will stay signed in here. Every other device is signed out.
      </p>

      <div>
        <button type="submit" className={BUTTON}>
          Change password
        </button>
      </div>
    </form>
  )
}

export function EmailForm({ email }: { email: string }) {
  const [state, action] = useActionState(requestEmailChangeAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">Change your e-mail address</h2>
      <FormError message={state.error} />

      <p className="text-sm text-muted-foreground">
        Currently <span className="font-medium text-foreground">{email}</span>.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Current password</span>
        <input
          type="password"
          name="currentPassword"
          className={FIELD}
          autoComplete="current-password"
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">New e-mail address</span>
        <input
          type="email"
          name="newEmail"
          className={FIELD}
          autoComplete="email"
          required
        />
      </label>

      <p className="text-xs text-muted-foreground">
        Nothing changes until you follow the link we send to the new address.
      </p>

      <div>
        <button type="submit" className={BUTTON}>
          Send confirmation
        </button>
      </div>
    </form>
  )
}

export function SignatureForm({
  signature,
  maxLength,
  locked,
  lockedReason,
}: {
  signature: string
  maxLength: number
  locked: boolean
  lockedReason: string | null
}) {
  const [state, action] = useActionState(saveSignatureAction, EMPTY_STATE)

  if (locked) {
    return (
      <div className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">Your signature is locked</h2>
        <p className="text-sm text-muted-foreground">
          A moderator has stopped your signature from being shown or changed.
          {lockedReason === null ? null : (
            <>
              {" "}
              Reason given: <span className="text-foreground">{lockedReason}</span>
            </>
          )}
        </p>
        {signature !== "" && (
          <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-3 text-xs">
            {signature}
          </pre>
        )}
      </div>
    )
  }

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />

      <MarkdownEditor
        id="signature-body"
        name="signature"
        scope="signature"
        label="Signature"
        rows={4}
        maxLength={maxLength}
        defaultValue={signature}
        hint={`Up to ${maxLength} characters. Bold, italic, strikethrough, code and links are allowed; headings, quotes, lists, tables and images are not — a signature repeats under every post you have ever made, and anything that changes its height changes every thread page.`}
      />

      <div>
        <button type="submit" className={BUTTON}>
          Save signature
        </button>
      </div>
    </form>
  )
}
