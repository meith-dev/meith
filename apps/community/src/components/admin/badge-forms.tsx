'use client'

import { useActionState } from 'react'

import { cn } from '@meith/ui'

import { PANEL_CARD } from '@/components/shell/panel-list'
import { EMPTY_STATE } from '@/server/auth-form-state'
import { removeBadgeAction, saveBadgeAction } from '@/server/group-badge-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { Saved } from './form-bits'

const GHOST =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function BadgeUploadForm({
  groupId,
  scheme,
  label,
  src,
  maxKib,
  copy,
}: {
  groupId: number
  scheme: 'light' | 'dark'
  label: string
  src: string | null
  maxKib: number
  copy: Copy
}) {
  const [saved, saveAction] = useActionState(saveBadgeAction, EMPTY_STATE)
  const [removed, removeAction] = useActionState(removeBadgeAction, EMPTY_STATE)

  const id = `badge-${groupId}-${scheme}`

  return (
    <div className={cn(PANEL_CARD, 'gap-3 p-3')}>
      <h3 className="text-sm font-medium">{label}</h3>

      <FormError message={saved.error ?? removed.error} />
      <Saved when={saved.notice === 'saved' || removed.notice === 'removed'}>
        {saved.notice === 'saved'
          ? fromCopy(copy, 'admin.saved')
          : fromCopy(copy, 'adminPanel.badge.removed')}
      </Saved>

      <div
        className={`flex min-h-12 items-center justify-center rounded-md border border-border bg-card p-2 ${
          scheme === 'dark' ? 'dark' : ''
        }`}
      >
        {src === null ? (
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'adminPanel.badge.noBadge')}
          </span>
        ) : (
          <img src={src} alt="" className="h-5 w-auto max-w-24 object-contain" />
        )}
      </div>

      <form action={saveAction} className="flex flex-col gap-2">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="scheme" value={scheme} />
        <label htmlFor={id} className="sr-only">
          {formatFromCopy(copy, 'adminPanel.badge.labelSr', { label })}
        </label>
        <input
          id={id}
          type="file"
          name="badge"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          required
          className="w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        <p className="text-xs text-muted-foreground">
          {formatFromCopy(copy, 'adminPanel.badge.formats', { maxKib })}
        </p>
        <div>
          <SubmitButton>{fromCopy(copy, 'adminPanel.badge.upload')}</SubmitButton>
        </div>
      </form>

      {src !== null && (
        <form action={removeAction}>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="scheme" value={scheme} />
          <button type="submit" className={GHOST}>
            {fromCopy(copy, 'admin.remove')}
          </button>
        </form>
      )}
    </div>
  )
}
