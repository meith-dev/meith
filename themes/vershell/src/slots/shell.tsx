import type { ShellModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function Shell({ viewer, children, copy }: ShellModel & { copy: SlotCopy }) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background text-foreground antialiased selection:bg-primary/20"
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <a
        href="#board-content"
        className="sr-only rounded-md focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-10 focus-visible:items-center focus-visible:bg-card focus-visible:px-4 focus-visible:text-[0.8125rem] focus-visible:font-medium focus-visible:text-primary focus-visible:shadow-[0_0_0_1px_var(--color-background),0_0_0_3px_var(--color-primary)]"
      >
        {fromSlotCopy(copy, 'vershell.shell.skipToContent')}
      </a>
      {children}
    </div>
  )
}
