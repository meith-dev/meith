import type { ShellModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

const FEATURES = "[font-feature-settings:'cv02','cv03','cv04','cv11']"

export function Shell({ viewer, children, copy }: ShellModel & { copy: SlotCopy }) {
  return (
    <div
      className={`flex min-h-dvh flex-col bg-background text-foreground antialiased ${FEATURES} selection:bg-primary/25`}
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <a
        href="#board-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-10 focus-visible:items-center focus-visible:border focus-visible:border-primary focus-visible:bg-background focus-visible:px-3 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground"
      >
        {fromSlotCopy(copy, 'meith.shell.skipToContent')}
      </a>
      {children}
    </div>
  )
}
