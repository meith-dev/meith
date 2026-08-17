'use client'

import { Component, createContext, type ReactNode, useContext } from 'react'

import { CRASH_NOTICE } from '@/view/error-notice'

interface CrashNoticeValue {
  readonly notice: ReactNode
  readonly requestId: string | null
}

const CrashNoticeContext = createContext<CrashNoticeValue>({ notice: null, requestId: null })

export function CrashNoticeProvider({
  notice,
  requestId,
  children,
}: CrashNoticeValue & { readonly children: ReactNode }) {
  return (
    <CrashNoticeContext.Provider value={{ notice, requestId }}>
      {children}
    </CrashNoticeContext.Provider>
  )
}

export function CrashNotice() {
  const { notice, requestId } = useContext(CrashNoticeContext)
  const plain = <PlainNotice requestId={requestId} />

  if (notice === null || notice === undefined) return plain

  return <ThemeGuard fallback={plain}>{notice}</ThemeGuard>
}

class ThemeGuard extends Component<
  { readonly fallback: ReactNode; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function PlainNotice({ requestId }: { readonly requestId: string | null }) {
  return (
    <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground">
      <p className="text-xs font-medium tracking-wide text-destructive uppercase">
        Error {CRASH_NOTICE.status}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{CRASH_NOTICE.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{CRASH_NOTICE.message}</p>

      <a
        href="/"
        className="mt-5 inline-block rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
      >
        Forum home
      </a>

      {requestId !== null && (
        <p className="mt-4 text-xs text-muted-foreground">
          Quote this if you report it:{' '}
          <code className="font-mono text-foreground select-all">{requestId}</code>
        </p>
      )}
    </section>
  )
}
