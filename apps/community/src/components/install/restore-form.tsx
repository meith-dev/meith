'use client'

import { useActionState } from 'react'

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@meith/ui'
import { Button } from '@meith/ui/button'

import { useFocusOnFail } from '@/components/auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '@/components/shell/copy'
import { type InstallRestoreState, installRestoreAction } from '@/server/install-restore-actions'

const EMPTY: InstallRestoreState = {}

export interface RestoreCandidateView {
  readonly name: string
  readonly label: string
  readonly size: string
  readonly location: string
}

export function InstallRestoreForm({
  candidates,
  destination,
  problem,
  copy,
}: {
  candidates: readonly RestoreCandidateView[]
  destination: string | null
  problem: string | null
  copy: Copy
}) {
  const [state, submit, pending] = useActionState(installRestoreAction, EMPTY)
  const errorRef = useFocusOnFail<HTMLDivElement>(state.error !== undefined)

  if (state.outcome !== undefined) {
    const { outcome } = state
    return (
      <Card>
        <CardHeader>
          <CardTitle>{fromCopy(copy, 'install.restore.doneTitle')}</CardTitle>
          <CardDescription>
            {formatFromCopy(copy, 'install.restore.doneDetail', {
              bundle: outcome.bundle,
              version: outcome.version,
              posts: outcome.posts,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {outcome.migrationsApplied > 0 && (
            <p>
              {formatFromCopy(copy, 'install.restore.migrated', {
                count: outcome.migrationsApplied,
              })}
            </p>
          )}
          {outcome.uploads === 'none' && <p>{fromCopy(copy, 'install.restore.noUploads')}</p>}
          {outcome.skippedKeys > 0 && (
            <p className="text-destructive">
              {formatFromCopy(copy, 'install.restore.skipped', { count: outcome.skippedKeys })}
            </p>
          )}
          <p>{fromCopy(copy, 'install.restore.next')}</p>
          <p>
            <a href="/login" className="underline">
              {fromCopy(copy, 'install.restore.signIn')}
            </a>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="install-restore">
      <CardHeader>
        <CardTitle id="install-restore">{fromCopy(copy, 'install.restore.title')}</CardTitle>
        <CardDescription>{fromCopy(copy, 'install.restore.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {problem !== null && (
          <Alert tone="warning">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {destination === null
              ? fromCopy(copy, 'install.restore.noneLocal')
              : formatFromCopy(copy, 'install.restore.noneAnywhere', { destination })}
          </p>
        ) : (
          <form action={submit} className="flex flex-col gap-4">
            {state.error !== undefined && (
              <Alert tone="error" ref={errorRef} tabIndex={-1}>
                <AlertDescription>
                  <AlertTitle>{fromCopy(copy, 'install.restore.notRestored')}</AlertTitle>{' '}
                  {state.error}
                </AlertDescription>
              </Alert>
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">
                {fromCopy(copy, 'install.restore.pick')}
              </legend>
              {candidates.map((candidate, index) => (
                <label key={candidate.name} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="bundle"
                    value={candidate.name}
                    defaultChecked={index === 0}
                    className="mt-1 size-4"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{candidate.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      <code>{candidate.name}</code> · {candidate.size} · {candidate.location}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" value="1" className="mt-1 size-4" />
              <span>{fromCopy(copy, 'install.restore.confirm')}</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="secondary" size="lg" disabled={pending}>
                {pending
                  ? fromCopy(copy, 'install.restore.restoring')
                  : fromCopy(copy, 'install.restore.submit')}
              </Button>
              <p className="text-xs text-muted-foreground">
                {pending
                  ? fromCopy(copy, 'install.restore.pendingNote')
                  : fromCopy(copy, 'install.restore.idleNote')}
              </p>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
