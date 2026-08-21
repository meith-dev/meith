'use client'

import { useState } from 'react'

import { Button } from '@meith/ui/button'

import { passkeyMessage, proveWithPasskey } from '@/components/auth/passkey-client'

import type { Copy } from '../shell/copy-record'

export function PasskeyProofButton({
  next,
  copy,
  waitingLabel,
  verifyLabel,
}: {
  readonly next: string
  readonly copy: Copy
  readonly waitingLabel: string
  readonly verifyLabel: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-5">
      <Button
        type="button"
        variant="primary"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          proveWithPasskey(next, copy)
            .then((target) => window.location.assign(target))
            .catch((problem: unknown) => {
              setError(passkeyMessage(problem, copy))
              setBusy(false)
            })
        }}
      >
        {busy ? waitingLabel : verifyLabel}
      </Button>
      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
