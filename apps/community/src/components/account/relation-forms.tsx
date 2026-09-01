'use client'

import { useActionState } from 'react'

import { textLinkVariants } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { removeRelationAction, setRelationAction } from '@/server/relation-actions'

import { FormError, PendingButton } from '../auth/form-controls'

const LINK_BUTTON = `${textLinkVariants({ size: 'sm' })} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`

const QUIET_BUTTON =
  'text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function SetRelationForm({
  userId,
  username,
  kind,
  returnTo,
  label,
}: {
  userId: number
  username: string
  kind: 'buddy' | 'ignore'
  returnTo: string
  label: string
}) {
  const [state, action] = useActionState(setRelationAction, EMPTY_STATE)

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <PendingButton showWorking className={kind === 'buddy' ? LINK_BUTTON : QUIET_BUTTON}>
        {label}
      </PendingButton>
    </form>
  )
}

export function RemoveRelationForm({
  userId,
  username,
  returnTo,
  label = 'Remove',
}: {
  userId: number
  username: string
  returnTo: string
  label?: string
}) {
  const [state, action] = useActionState(removeRelationAction, EMPTY_STATE)

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <PendingButton showWorking className={QUIET_BUTTON}>
        {label}
      </PendingButton>
    </form>
  )
}
