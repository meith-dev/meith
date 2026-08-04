"use client"

/**
 * F81's token controls.
 *
 * The issue form's result is the one screen on this board that shows a secret,
 * and it says so in as many words. There is deliberately no "reveal again"
 * anywhere: the board stores a hash, so the value on screen is the only copy
 * that will ever exist, and an interface that implied otherwise would teach
 * operators to close the panel expecting to come back to it.
 */
import { useActionState } from "react"

import { issueApiTokenAction, revokeApiTokenAction } from "@/server/api-token-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError, SubmitButton } from "../auth/form-controls"

export function IssueTokenForm({ scopes }: { scopes: readonly string[] }) {
  const [state, action] = useActionState(issueApiTokenAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />

      {state.notice === "issued" && state.values?.token !== undefined && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md border border-accent bg-post-highlight px-3 py-3"
        >
          <p className="text-sm font-semibold">
            Copy this now — it is not shown again and cannot be recovered.
          </p>
          <code className="block overflow-x-auto rounded-sm bg-card px-2 py-1 font-mono text-sm">
            {state.values.token}
          </code>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Status page poller"
          className="rounded-sm border border-input bg-card px-2 py-1"
        />
        <span className="text-xs text-muted-foreground">
          What this token is for, so a later reader knows what breaks if it is revoked.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Scopes</legend>
        <span className="text-xs text-muted-foreground">
          A token can never do more than its owner may. Scopes narrow it further.
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
        <span className="font-medium">Expires in (days)</span>
        <input
          name="expiresInDays"
          inputMode="numeric"
          placeholder="Leave empty for no expiry"
          className="w-56 rounded-sm border border-input bg-card px-2 py-1"
        />
      </label>

      <SubmitButton>Issue token</SubmitButton>
    </form>
  )
}

export function RevokeTokenForm({ tokenId }: { tokenId: number }) {
  const [state, action] = useActionState(revokeApiTokenAction, EMPTY_STATE)

  return (
    <form action={action}>
      <input type="hidden" name="tokenId" value={tokenId} />
      <SubmitButton>Revoke</SubmitButton>
      {state.error !== undefined && (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      )}
    </form>
  )
}
