'use client'

import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { passkeyMessage, passkeysAvailable, signInWithPasskey } from './passkey-client'

export function PasskeySignIn({ next }: { readonly next?: string | undefined }) {
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
          signInWithPasskey(next)
            .then((destination) => {
              window.location.assign(destination)
            })
            .catch((problem: unknown) => {
              setError(passkeyMessage(problem))
              setBusy(false)
            })
        }}
      >
        {busy ? 'Waiting for your device…' : 'Sign in with a passkey'}
      </Button>
    </div>
  )
}
