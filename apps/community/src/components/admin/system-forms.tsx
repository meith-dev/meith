'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  clearCacheAction,
  pruneSessionsAction,
  pruneTokensAction,
  recountAction,
  reindexSearchAction,
  retryJobAction,
} from '@/server/system-admin-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { Saved } from './form-bits'

function Result({ children }: { children: React.ReactNode }) {
  return <Saved>{children}</Saved>
}

export function PruneSessionsForm({ prunable, copy }: { prunable: number; copy: Copy }) {
  const [state, action] = useActionState(pruneSessionsAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === 'pruned' && (
        <Result>
          {formatFromCopy(copy, 'adminPanel.system.sessionsRemoved', {
            removed: state.values?.removed ?? '',
          })}
        </Result>
      )}
      <div>
        <SubmitButton>
          {formatFromCopy(copy, 'adminPanel.system.pruneSessions', { prunable })}
        </SubmitButton>
      </div>
    </form>
  )
}

export function PruneTokensForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(pruneTokensAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === 'pruned' && (
        <Result>
          {formatFromCopy(copy, 'adminPanel.system.tokensRemoved', {
            removed: state.values?.removed ?? '',
          })}
        </Result>
      )}
      <div>
        <SubmitButton>{fromCopy(copy, 'adminPanel.system.pruneTokens')}</SubmitButton>
      </div>
    </form>
  )
}

export function RecountForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(recountAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === 'ran' && (
        <Result>
          {formatFromCopy(copy, 'adminPanel.system.recountResult', {
            corrected: Number(state.values?.corrected ?? 0),
          })}
        </Result>
      )}
      <div>
        <SubmitButton>{fromCopy(copy, 'adminPanel.system.recountRun')}</SubmitButton>
      </div>
    </form>
  )
}

export function ClearCacheForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(clearCacheAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === 'cleared' && (
        <Result>
          {formatFromCopy(copy, 'adminPanel.system.cleared', { tag: state.values?.tag ?? '' })}
        </Result>
      )}

      <input type="hidden" name="what" value="forums" />
      <p className="text-xs text-muted-foreground">
        {fromCopy(copy, 'adminPanel.system.clearNote')}
      </p>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminPanel.system.clearForumTree')}</SubmitButton>
      </div>
    </form>
  )
}

export function RetryJobForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(retryJobAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <FormError message={state.error} />
      {state.notice === 'retried' && <Result>{fromCopy(copy, 'adminPanel.system.retried')}</Result>}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminPanel.system.jobId')}</span>
        <input
          name="jobId"
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          required
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'adminPanel.system.jobIdHint')}
        </span>
      </label>

      <div>
        <SubmitButton>{fromCopy(copy, 'adminPanel.system.retry')}</SubmitButton>
      </div>
    </form>
  )
}

export function ReindexSearchForm({ pending, copy }: { pending: number; copy: Copy }) {
  const [state, action] = useActionState(reindexSearchAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === 'finished' && (
        <Result>
          {formatFromCopy(copy, 'adminPanel.system.indexFinished', {
            indexed: state.values?.indexed ?? '',
          })}
        </Result>
      )}
      {state.notice === 'more' && (
        <Result>
          {formatFromCopy(copy, 'adminPanel.system.indexMore', {
            indexed: state.values?.indexed ?? '',
            pending: state.values?.pending ?? '',
          })}
        </Result>
      )}
      <div>
        <SubmitButton>
          {pending === 0
            ? fromCopy(copy, 'adminPanel.system.nothingToIndex')
            : formatFromCopy(copy, 'adminPanel.system.indexNext', { pending })}
        </SubmitButton>
      </div>
    </form>
  )
}
