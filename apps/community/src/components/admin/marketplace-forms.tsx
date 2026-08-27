'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { refreshMarketplaceAction } from '@/server/marketplace-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'
import { Saved } from './form-bits'

export function MarketplaceRefreshForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(refreshMarketplaceAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <Saved when={state.notice === 'refreshed'}>
        {fromCopy(copy, 'adminPanel.marketplace.refreshed')}
      </Saved>
      <button
        type="submit"
        className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:border-primary hover:bg-accent"
      >
        {fromCopy(copy, 'adminPanel.marketplace.refresh')}
      </button>
    </form>
  )
}
