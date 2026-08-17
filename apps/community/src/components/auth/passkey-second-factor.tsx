'use client'

import { useEffect, useState } from 'react'

import { Alert, AlertDescription, Separator } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { confirmWithPasskey, passkeyMessage, passkeysAvailable } from './passkey-client'

export function PasskeySecondFactor({ next }: { readonly next?: string | undefined }) {
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAvailable(passkeysAvailable())
  }, [])

  if (!available) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

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
          confirmWithPasskey(next)
            .then((destination) => {
              window.location.assign(destination)
            })
            .catch((problem: unknown) => {
              setError(passkeyMessage(problem))
              setBusy(false)
            })
        }}
      >
        {busy ? 'Waiting for your device…' : 'Confirm with a passkey instead'}
      </Button>
    </div>
  )
}
