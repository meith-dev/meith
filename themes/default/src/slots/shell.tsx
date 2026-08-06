import type { ShellModel } from '@meith/theme-kit'

export function Shell({ viewer, children }: ShellModel) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background text-foreground"
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <a
        href="#board-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-9 focus-visible:items-center focus-visible:rounded-md focus-visible:border focus-visible:border-border focus-visible:bg-card focus-visible:px-3 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-lg"
      >
        Skip to content
      </a>
      {children}
    </div>
  )
}
