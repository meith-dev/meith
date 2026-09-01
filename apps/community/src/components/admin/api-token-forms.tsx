'use client'

import { useActionState } from 'react'

import { issueApiTokenAction, revokeApiTokenAction } from '@/server/api-token-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { FormError, SubmitButton } from '../auth/form-controls'
import { ConfirmDialog } from '../shell/confirm-dialog'
import { type Copy, fromCopy } from '../shell/copy'

export function IssueTokenForm({ scopes, copy }: { scopes: readonly string[]; copy: Copy }) {
  const [state, action] = useActionState(issueApiTokenAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />

      {state.notice === 'issued' && state.values?.token !== undefined && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-accent bg-post-highlight px-3 py-3"
        >
          <p className="text-sm font-semibold">{fromCopy(copy, 'adminPanel.token.copyNow')}</p>
          <code className="block overflow-x-auto rounded-sm bg-card px-2 py-1 font-mono text-sm">
            {state.values.token}
          </code>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminPanel.token.name')}</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder={fromCopy(copy, 'adminPanel.token.namePlaceholder')}
          className="rounded-sm border border-input bg-card px-2 py-1"
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminPanel.token.nameHint')}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{fromCopy(copy, 'adminPanel.token.scopes')}</legend>
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminPanel.token.scopesHint')}
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {scopes.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="scopes" value={scope} />
              <code className="font-mono text-xs">{scope}</code>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminPanel.token.expiresInDays')}</span>
        <input
          name="expiresInDays"
          inputMode="numeric"
          placeholder={fromCopy(copy, 'adminPanel.token.expiresPlaceholder')}
          className="w-56 rounded-sm border border-input bg-card px-2 py-1"
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminPanel.token.expiresHint')}
        </span>
      </label>

      <SubmitButton>{fromCopy(copy, 'adminPanel.token.issue')}</SubmitButton>
    </form>
  )
}

export function RevokeTokenForm({ tokenId, copy }: { tokenId: number; copy: Copy }) {
  const [state, action] = useActionState(revokeApiTokenAction, EMPTY_STATE)

  return (
    <>
      <form action={action}>
        <input type="hidden" name="tokenId" value={tokenId} />
        <SubmitButton>{fromCopy(copy, 'adminPanel.token.revoke')}</SubmitButton>
        {state.error !== undefined && (
          <span className="ml-2 text-xs text-destructive">{state.error}</span>
        )}
      </form>
      <ConfirmDialog confirm={state.confirm} action={action} />
    </>
  )
}
