'use client'

import { useActionState } from 'react'

import type { SubscriptionMode } from '@meith/subscriptions'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  changePasswordAction,
  requestEmailChangeAction,
  saveDisplayGroupAction,
  saveOptionsAction,
  saveProfileAction,
  saveSignatureAction,
} from '@/server/usercp-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { MarkdownEditor } from '../content/markdown-editor'
import { CustomField, type CustomFieldInput } from '../profile/custom-field'
import { type Copy, fromCopy } from '../shell/copy'

export type { CustomFieldInput }

const FIELD =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const CARD = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-5'

export function ProfileForm({
  location,
  website,
  bio,
  customFields = [],
  copy,
}: {
  location: string
  website: string
  bio: string
  customFields?: readonly CustomFieldInput[]
  copy: Copy
}) {
  const [state, action] = useActionState(saveProfileAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.profile.location')}</span>
        <input name="location" defaultValue={location} className={FIELD} maxLength={100} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.profile.website')}</span>
        <input
          name="website"
          defaultValue={website}
          className={FIELD}
          maxLength={200}
          inputMode="url"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.profile.bio')}</span>
        <textarea name="bio" defaultValue={bio} className={FIELD} rows={5} maxLength={1000} />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.profile.bioHint')}
        </span>
      </label>

      {customFields.map((field) => (
        <CustomField key={field.key} field={field} className={FIELD} />
      ))}

      <div>
        <PendingButton showWorking className={BUTTON}>
          {fromCopy(copy, 'accountForm.profile.submit')}
        </PendingButton>
      </div>
    </form>
  )
}

export function DisplayGroupForm({
  choices,
  selected,
  copy,
}: {
  choices: readonly { value: string; label: string }[]
  selected: string
  copy: Copy
}) {
  const [state, action] = useActionState(saveDisplayGroupAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">
        {fromCopy(copy, 'accountForm.displayGroup.title')}
      </h2>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.displayGroup.label')}</span>
        <select name="displayGroupId" defaultValue={selected} className={FIELD}>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.displayGroup.hint')}
        </span>
      </label>

      <div>
        <PendingButton showWorking className={BUTTON}>
          {fromCopy(copy, 'accountForm.displayGroup.submit')}
        </PendingButton>
      </div>
    </form>
  )
}

export function OptionsForm({
  timezone,
  timezones,
  locale,
  locales,
  postsPerPage,
  threadsPerPage,
  invisible,
  autoWatchOwnThreads,
  autoWatchRepliedThreads,
  autoWatchChoices,
  copy,
}: {
  timezone: string
  timezones: readonly { value: string; label: string }[]
  locale: string
  locales: readonly { value: string; label: string }[]
  postsPerPage: string
  threadsPerPage: string
  invisible: boolean
  autoWatchOwnThreads: SubscriptionMode
  autoWatchRepliedThreads: SubscriptionMode
  autoWatchChoices: readonly { value: SubscriptionMode; label: string }[]
  copy: Copy
}) {
  const [state, action] = useActionState(saveOptionsAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.options.timezone')}</span>
        <select name="timezone" defaultValue={timezone} className={FIELD}>
          {timezones.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.options.timezoneHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.options.locale')}</span>
        <select name="locale" defaultValue={locale} className={FIELD}>
          {locales.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.options.localeHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.options.postsPerPage')}</span>
        <input
          name="postsPerPage"
          defaultValue={postsPerPage}
          className={FIELD}
          inputMode="numeric"
          placeholder={fromCopy(copy, 'accountForm.options.postsPerPage.placeholder')}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.options.threadsPerPage')}</span>
        <input
          name="threadsPerPage"
          defaultValue={threadsPerPage}
          className={FIELD}
          inputMode="numeric"
          placeholder={fromCopy(copy, 'accountForm.options.threadsPerPage.placeholder')}
        />
      </label>

      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'accountForm.options.pageSizeHint')}
      </p>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="invisible" defaultChecked={invisible} className="mt-1" />
        <span className="flex flex-col gap-1">
          <span className="font-medium">{fromCopy(copy, 'accountForm.options.invisible')}</span>
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'accountForm.options.invisibleHint')}
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          {fromCopy(copy, 'accountForm.options.autoWatchOwnThreads')}
        </span>
        <select name="autoWatchOwnThreads" defaultValue={autoWatchOwnThreads} className={FIELD}>
          {autoWatchChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.options.autoWatchOwnThreadsHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          {fromCopy(copy, 'accountForm.options.autoWatchRepliedThreads')}
        </span>
        <select
          name="autoWatchRepliedThreads"
          defaultValue={autoWatchRepliedThreads}
          className={FIELD}
        >
          {autoWatchChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.options.autoWatchRepliedThreadsHint')}
        </span>
      </label>

      <div>
        <PendingButton showWorking className={BUTTON}>
          {fromCopy(copy, 'accountForm.options.submit')}
        </PendingButton>
      </div>
    </form>
  )
}

export function PasswordForm({ minLength, copy }: { minLength: number; copy: Copy }) {
  const [state, action] = useActionState(changePasswordAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">
        {fromCopy(copy, 'accountForm.password.title')}
      </h2>
      <FormError message={state.error} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.password.current')}</span>
        <input
          type="password"
          name="currentPassword"
          className={FIELD}
          autoComplete="current-password"
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.password.new')}</span>
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
        <span className="font-medium">{fromCopy(copy, 'accountForm.password.confirm')}</span>
        <input
          type="password"
          name="confirmPassword"
          className={FIELD}
          autoComplete="new-password"
          minLength={minLength}
          required
        />
      </label>

      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'accountForm.password.note')}</p>

      <div>
        <PendingButton showWorking className={BUTTON}>
          {fromCopy(copy, 'accountForm.password.submit')}
        </PendingButton>
      </div>
    </form>
  )
}

export function EmailForm({ email, copy }: { email: string; copy: Copy }) {
  const [state, action] = useActionState(requestEmailChangeAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <h2 className="text-lg font-semibold tracking-tight">
        {fromCopy(copy, 'accountForm.email.title')}
      </h2>
      <FormError message={state.error} />

      <p className="text-sm text-muted-foreground">
        {copy['accountForm.email.currentLead']}
        <span className="font-medium text-foreground">{email}</span>
        {copy['accountForm.email.currentTail']}
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.password.current')}</span>
        <input
          type="password"
          name="currentPassword"
          className={FIELD}
          autoComplete="current-password"
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'accountForm.email.new')}</span>
        <input type="email" name="newEmail" className={FIELD} autoComplete="email" required />
      </label>

      <p className="text-xs text-muted-foreground">{fromCopy(copy, 'accountForm.email.note')}</p>

      <div>
        <PendingButton showWorking className={BUTTON}>
          {fromCopy(copy, 'accountForm.email.submit')}
        </PendingButton>
      </div>
    </form>
  )
}

export function SignatureForm({
  signature,
  maxLength,
  locked,
  lockedReason,
  copy,
}: {
  signature: string
  maxLength: number
  locked: boolean
  lockedReason: string | null
  copy: Copy
}) {
  const [state, action] = useActionState(saveSignatureAction, EMPTY_STATE)

  if (locked) {
    return (
      <div className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.signature.lockedTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {fromCopy(copy, 'accountForm.signature.lockedBody')}
          {lockedReason === null ? null : (
            <>
              {' '}
              {copy['accountForm.locked.reasonLead']}
              <span className="text-foreground">{lockedReason}</span>
              {copy['accountForm.locked.reasonTail']}
            </>
          )}
        </p>
        {signature !== '' && (
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
        label={fromCopy(copy, 'accountForm.signature.label')}
        rows={4}
        maxLength={maxLength}
        defaultValue={signature}
        hint={fromCopy(copy, 'accountForm.signature.hint')}
      />

      <div>
        <PendingButton showWorking className={BUTTON}>
          {fromCopy(copy, 'accountForm.signature.submit')}
        </PendingButton>
      </div>
    </form>
  )
}
