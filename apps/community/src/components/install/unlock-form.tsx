'use client'

import { useActionState } from 'react'

import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@meith/ui'
import { Button } from '@meith/ui/button'

import { useFocusOnFail } from '@/components/auth/form-controls'
import { type InstallUnlockState, installUnlockAction } from '@/server/install-actions'

const EMPTY: InstallUnlockState = {}

export interface InstallUnlockCopy {
  readonly title: string
  readonly lede: string
  readonly label: string
  readonly button: string
  readonly pending: string
}

export function InstallUnlockForm({ copy }: { copy: InstallUnlockCopy }) {
  const [state, submit, pending] = useActionState(installUnlockAction, EMPTY)
  const errorRef = useFocusOnFail<HTMLDivElement>(state.error !== undefined)

  return (
    <Card aria-labelledby="install-unlock">
      <CardHeader>
        <CardTitle id="install-unlock">{copy.title}</CardTitle>
        <CardDescription>{copy.lede}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="flex flex-col gap-4">
          {state.error !== undefined && (
            <Alert tone="error" ref={errorRef} tabIndex={-1}>
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            {copy.label}
            <input
              type="password"
              name="secret"
              required
              autoComplete="off"
              className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </label>
          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? copy.pending : copy.button}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
