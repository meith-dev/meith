'use client'

import { useCallback, useEffect, useState } from 'react'

import { Toast, type ToastTone } from '@meith/ui/toast'

import { fromCopy, useCopy } from './copy'

export function NoticeToast({
  kind,
  message,
  dismissHref,
}: {
  kind: ToastTone
  message: string
  dismissHref: string | null
}) {
  const copy = useCopy()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const clearNotice = useCallback(() => {
    if (dismissHref === null || typeof window === 'undefined') return
    window.history.replaceState(window.history.state, '', dismissHref)
  }, [dismissHref])

  if (!mounted) return null

  return (
    <div
      data-notice="toast"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <Toast tone={kind} dismissLabel={fromCopy(copy, 'notice.dismiss')} onDismiss={clearNotice}>
        {message}
      </Toast>
    </div>
  )
}
