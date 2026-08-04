import type { HeaderModel } from '@meith/theme-kit'

/**
 * A masthead with the navigation as a tab strip.
 *
 * The default theme puts the board title and the user panel on one line and the
 * sections beneath as plain links. Midnight separates them: the title is a
 * banner, and the sections are bordered tabs — different markup, different
 * shape, same `HeaderModel`.
 */
export function Header({ boardTitle, homeHref, navigation, children }: HeaderModel) {
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border bg-secondary px-4 py-3">
        <a
          href={homeHref}
          className="font-mono text-xl font-semibold tracking-tight text-foreground hover:text-primary"
        >
          {boardTitle}
        </a>
        {children}
      </div>

      {navigation.length > 0 && (
        <nav aria-label="Board sections" className="flex flex-wrap border-b border-border">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="border-r border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
