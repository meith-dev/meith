'use client'

import { useEffect, useState } from 'react'

import { Alert, AlertDescription, Input } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { enrolPasskey, passkeyMessage, passkeysAvailable } from '@/components/auth/passkey-client'

import { type Copy, fromCopy } from '../shell/copy'

export function PasskeyEnrol({ copy }: { readonly copy: Copy }) {
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
        {fromCopy(copy, 'accountForm.passkey.unsupported')}
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
        <span className="font-medium">{fromCopy(copy, 'accountForm.passkey.label')}</span>
        <Input
          value={label}
          maxLength={60}
          placeholder={fromCopy(copy, 'accountForm.passkey.placeholder')}
          onChange={(event) => setLabel(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.passkey.hint')}
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
            enrolPasskey(label, copy)
              .then(() => {
                window.location.assign('/usercp/security?passkey=added')
              })
              .catch((problem: unknown) => {
                const message = passkeyMessage(problem, copy)
                if (message.includes('recent verification')) {
                  window.location.assign('/usercp/security/verify?next=%2Fusercp%2Fsecurity')
                  return
                }
                setError(message)
                setBusy(false)
              })
          }}
        >
          {busy
            ? fromCopy(copy, 'authForm.passkey.waiting')
            : fromCopy(copy, 'accountForm.passkey.submit')}
        </Button>
      </div>
    </div>
  )
}
