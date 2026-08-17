'use client'

import { useActionState } from 'react'

import { cn } from '@meith/ui'

import { PANEL_CARD } from '@/components/shell/panel-list'
import { EMPTY_STATE } from '@/server/auth-form-state'
import { removeBadgeAction, saveBadgeAction } from '@/server/group-badge-actions'

import { FormError, SubmitButton } from '../auth/form-controls'

const GHOST =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function BadgeUploadForm({
  groupId,
  scheme,
  label,
  src,
  maxKib,
}: {
  groupId: number
  scheme: 'light' | 'dark'
  label: string
  src: string | null
  maxKib: number
}) {
  const [saved, saveAction] = useActionState(saveBadgeAction, EMPTY_STATE)
  const [removed, removeAction] = useActionState(removeBadgeAction, EMPTY_STATE)

  const id = `badge-${groupId}-${scheme}`

  return (
    <div className={cn(PANEL_CARD, 'gap-3 p-3')}>
      <h3 className="text-sm font-medium">{label}</h3>

      <FormError message={saved.error ?? removed.error} />
      {(saved.notice === 'saved' || removed.notice === 'removed') && (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {saved.notice === 'saved' ? 'Saved.' : 'Removed.'}
        </p>
      )}

      <div
        className={`flex min-h-12 items-center justify-center rounded-md border border-border bg-card p-2 ${
          scheme === 'dark' ? 'dark' : ''
        }`}
      >
        {src === null ? (
          <span className="text-xs text-muted-foreground">No badge</span>
        ) : (
          <img src={src} alt="" className="h-5 w-auto max-w-24 object-contain" />
        )}
      </div>

      <form action={saveAction} className="flex flex-col gap-2">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="scheme" value={scheme} />
        <label htmlFor={id} className="sr-only">
          {label} badge
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
          PNG, JPEG, WebP or SVG, up to {maxKib} KiB. The contents decide the format, not the file
          name.
        </p>
        <div>
          <SubmitButton>Upload</SubmitButton>
        </div>
      </form>

      {src !== null && (
        <form action={removeAction}>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="scheme" value={scheme} />
          <button type="submit" className={GHOST}>
            Remove
          </button>
        </form>
      )}
    </div>
  )
}
