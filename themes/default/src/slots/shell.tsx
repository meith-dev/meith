import type { ShellModel } from '@meith/theme-kit'

/**
 * The page frame (F25/F27).
 *
 * Everything visible arrives as `children` — header, notices, body, footer are
 * separate slots that the page composes. A slot never renders another slot; see
 * the flat-composition note in `theme-kit`'s view-models.
 *
 * Plain `<a>` for the skip link rather than `next/link`: a theme should need
 * nothing but `@meith/theme-kit` and `@meith/ui`, and a full navigation is the
 * right behaviour for a board that ships almost no JavaScript anyway.
 *
 * The skip link is `sr-only` until it takes focus and then becomes a real,
 * visible control. A skip link that stays hidden while focused is the version
 * most sites ship, and it is worse than none: a keyboard user tabs to something
 * they cannot see, presses enter, and the page moves for no visible reason.
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
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:inline-flex focus-visible:h-9 focus-visible:items-center focus-visible:rounded-md focus-visible:border focus-visible:border-border focus-visible:bg-card focus-visible:px-3 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-lg"
      >
        Skip to content
      </a>
      {children}
    </div>
  )
}
