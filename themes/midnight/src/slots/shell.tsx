import type { ShellModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function Shell({ viewer, children, copy }: ShellModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.shell.${key}`)

  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <a
        href="#board-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:border focus:border-primary focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        {c('skipToContent')}
      </a>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col border-x border-border bg-card">
        {children}
      </div>
    </div>
  )
}
