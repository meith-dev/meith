import type { ShellModel } from '@meith/theme-kit'

const APP_REGIONS = `
[data-theme-raidframe] .font-heading:not([class*="tracking-"]) {
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
[data-theme-raidframe] a.rounded-full,
[data-theme-raidframe] button.rounded-full,
[data-theme-raidframe] input.rounded-full,
[data-theme-raidframe] select.rounded-full {
  border-radius: var(--radius);
}
[data-theme-raidframe] :is(caption, legend, th):not([class*="tracking-"]) {
  letter-spacing: 0.06em;
}
`

export function Shell({ viewer, children }: ShellModel) {
  return (
    <div
      className="relative min-h-dvh bg-background text-foreground"
      data-theme-raidframe=""
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <style>{APP_REGIONS}</style>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(70%_100%_at_50%_0%,var(--color-primary),transparent_72%)] opacity-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 h-64 bg-[radial-gradient(60%_100%_at_50%_100%,var(--color-forum-unread),transparent_75%)] opacity-[0.07]"
      />

      <a
        href="#board-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:border focus:border-primary focus:bg-card focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:uppercase"
      >
        Skip to content
      </a>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col border-x border-border bg-background/80">
        {children}
      </div>
    </div>
  )
}
