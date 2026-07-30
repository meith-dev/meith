import type { ShellModel } from '@forum/theme-kit'

/**
 * The page frame (F25/F27).
 *
 * Everything visible arrives as `children` — header, notices, body, footer are
 * separate slots that the page composes. A slot never renders another slot; see
 * the flat-composition note in `theme-kit`'s view-models.
 *
 * Plain `<a>` for the skip link rather than `next/link`: a theme should need
 * nothing but `@forum/theme-kit`, and a full navigation is the right behaviour
 * for a board that ships almost no JavaScript anyway.
 */
export function Shell({ viewer, children }: ShellModel) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background text-foreground"
      /*
       * A styling hook, not a permission signal. Themes restyle for signed-in
       * viewers; anything that must not be *seen* is not rendered in the first
       * place, because CSS is not authorization.
       */
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <a
        href="#board-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-sm"
      >
        Skip to content
      </a>
      {children}
    </div>
  )
}
