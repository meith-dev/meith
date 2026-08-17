'use client'

import { useEffect, useState } from 'react'

import { Alert, AlertDescription, Input } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { enrolPasskey, passkeyMessage, passkeysAvailable } from '@/components/auth/passkey-client'

export function PasskeyEnrol({ limit }: { readonly limit: number }) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAvailable(passkeysAvailable())
  }, [])

  if (available === false) {
    return (
      <p className="text-sm text-muted-foreground">
        This browser cannot create passkeys, so there is nothing to add here. Try one that can, or
        keep using your password.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : (
        <Alert tone="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">What to call it</span>
        <Input
          value={label}
          maxLength={60}
          placeholder="Work laptop"
          onChange={(event) => setLabel(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          For your own eyes, so you can tell one device from another later. Up to {limit} passkeys
          per account.
        </span>
      </label>

      <div>
        <Button
          type="button"
          variant="primary"
          disabled={busy || available === null}
          onClick={() => {
            setError(null)
            setBusy(true)
            enrolPasskey(label)
              .then(() => {
                window.location.assign('/usercp/security?passkey=added')
              })
              .catch((problem: unknown) => {
                setError(passkeyMessage(problem))
                setBusy(false)
              })
          }}
        >
          {busy ? 'Waiting for your device…' : 'Add a passkey'}
        </Button>
      </div>
    </div>
  )
}
