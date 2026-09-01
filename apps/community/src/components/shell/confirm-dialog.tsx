'use client'

import { useEffect, useState } from 'react'

import { AlertDialog } from '@meith/ui/dialog'

import type { ConfirmRequest } from '@/server/auth-form-state'

import { PendingButton } from '../auth/form-controls'
import { fromCopy, useCopy } from './copy'

const CONFIRM_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60'

const CANCEL_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function ConfirmDialog({
  confirm,
  action,
}: {
  confirm: ConfirmRequest | undefined
  action: (formData: FormData) => void
}) {
  const copy = useCopy()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (confirm !== undefined) setOpen(true)
  }, [confirm])

  if (confirm === undefined) return null

  const hidden = confirm.fields.map((field, index) => {
    const fieldKey = `${index}:${field.name}`
    return <input key={fieldKey} type="hidden" name={field.name} value={field.value} />
  })

  const confirmLabel = fromCopy(copy, 'confirm.confirm')

  return (
    <>
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>[data-confirm="dialog"]{display:none}[data-confirm="plain"]{display:flex!important}</style>',
        }}
      />

      <span data-confirm="dialog">
        <AlertDialog.Root open={open} onOpenChange={setOpen}>
          <AlertDialog.Portal>
            <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40 transition-opacity duration-100 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
            <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg transition-[opacity,transform] duration-100 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <AlertDialog.Title className="text-base font-semibold">
                {fromCopy(copy, 'confirm.heading')}
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted-foreground">
                {confirm.message}
              </AlertDialog.Description>
              <div className="flex justify-end gap-2">
                <AlertDialog.Close className={CANCEL_BUTTON}>
                  {fromCopy(copy, 'confirm.cancel')}
                </AlertDialog.Close>
                <form action={action}>
                  {hidden}
                  <input type="hidden" name="confirmed" value="1" />
                  <PendingButton showWorking className={CONFIRM_BUTTON}>
                    {confirmLabel}
                  </PendingButton>
                </form>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </span>

      <div
        data-confirm="plain"
        className="hidden flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
      >
        <p className="text-sm text-card-foreground">{confirm.message}</p>
        <form action={action}>
          {hidden}
          <input type="hidden" name="confirmed" value="1" />
          <PendingButton showWorking className={CONFIRM_BUTTON}>
            {confirmLabel}
          </PendingButton>
        </form>
      </div>
    </>
  )
}
