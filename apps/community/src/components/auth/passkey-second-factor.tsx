'use client'

import { useEffect, useState } from 'react'

import { Alert, AlertDescription, Separator } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { type Copy, fromCopy } from '../shell/copy'
import { confirmWithPasskey, passkeyMessage, passkeysAvailable } from './passkey-client'

export function PasskeySecondFactor({
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {fromCopy(copy, 'authForm.or')}
        </span>
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
          confirmWithPasskey(next, copy)
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
          : fromCopy(copy, 'authForm.passkey.confirm')}
      </Button>
    </div>
  )
}
