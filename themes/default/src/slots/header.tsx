import type { HeaderModel } from '@forum/theme-kit'

/**
 * The board header (F25/F27).
 *
 * `children` is the user panel, so a theme decides where in the header it sits
 * without the page knowing anything about this theme's layout.
 */
export function Header({ boardTitle, homeHref, navigation, children }: HeaderModel) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <a
          href={homeHref}
          className="font-serif text-lg font-semibold text-foreground hover:text-primary"
        >
          {boardTitle}
        </a>
        {children}
      </div>

      {navigation.length > 0 && (
        <nav
          aria-label="Board sections"
          className="mx-auto flex w-full max-w-5xl flex-wrap gap-4 px-6 pb-3 text-sm"
        >
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
