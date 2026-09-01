'use client'

import { Toast, type ToastTone } from '@meith/ui/toast'

import { fromCopy, useCopy } from './copy'

export function NoticeToast({ kind, message }: { kind: ToastTone; message: string }) {
  const copy = useCopy()

  return (
    <div
      data-notice="toast"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <Toast tone={kind} dismissLabel={fromCopy(copy, 'notice.dismiss')}>
        {message}
      </Toast>
    </div>
  )
}
