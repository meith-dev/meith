import type { ShellModel } from '@meith/theme-kit'

/**
 * The page frame.
 *
 * The default theme's shell is a full-bleed column; midnight puts the board in a
 * ruled **wrapper** with a visible edge, the way bulletin boards looked before
 * they looked like products. That is a whole-page difference expressed in one
 * slot, which is the property the freeze is supposed to deliver.
 *
 * `data-viewer` is kept, and kept meaningless: it is a styling hook, never a
 * permission signal. Anything a guest must not see is not in the model.
 */
export function Shell({ viewer, children }: ShellModel) {
  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      data-viewer={viewer.isGuest ? 'guest' : 'member'}
    >
      <a
        href="#board-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:border focus:border-primary focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col border-x border-border bg-card">
        {children}
      </div>
    </div>
  )
}
