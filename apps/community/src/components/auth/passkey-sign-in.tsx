'use client'

import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { type Copy, fromCopy } from '../shell/copy'
import { passkeyMessage, passkeysAvailable, signInWithPasskey } from './passkey-client'

export function PasskeySignIn({
  next,
  copy,
}: {
  readonly next?: string | undefined
  readonly copy: Copy
}) {
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAvailable(passkeysAvailable())
  }, [])

  if (!available) return null

  return (
    <div className="flex flex-col gap-2">
      {error === null ? null : (
        <Alert tone="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => {
          setError(null)
          setBusy(true)
          signInWithPasskey(next, copy)
            .then((destination) => {
              window.location.assign(destination)
            })
            .catch((problem: unknown) => {
              setError(passkeyMessage(problem, copy))
              setBusy(false)
            })
        }}
      >
        {busy
          ? fromCopy(copy, 'authForm.passkey.waiting')
          : fromCopy(copy, 'authForm.passkey.signIn')}
      </Button>
    </div>
  )
}
