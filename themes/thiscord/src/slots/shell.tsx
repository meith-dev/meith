import type { ShellModel } from '@meith/theme-kit'

export function Shell({ viewer, children }: ShellModel) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background text-foreground"
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <a
        href="#board-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-9 focus-visible:items-center focus-visible:rounded-sm focus-visible:bg-primary focus-visible:px-4 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground focus-visible:shadow-elevation"
      >
        Skip to content
      </a>
      {children}
    </div>
  )
}
