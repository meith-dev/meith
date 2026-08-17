'use client'

import { CrashNotice } from '@/components/shell/crash-notice'

export default function ErrorPage() {
  return (
    <main id="board-content" tabIndex={-1} className="flex min-h-dvh items-center justify-center px-6 py-12">
      <CrashNotice />
    </main>
  )
}
