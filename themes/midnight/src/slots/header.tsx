import type { HeaderModel } from '@meith/theme-kit'

/**
 * A masthead with the navigation as a tab strip.
 *
 * The default theme puts the board title and the user panel on one line and the
 * sections beneath as plain links. Midnight separates them: the title is a
 * banner, and the sections are bordered tabs — different markup, different
 * shape, same `HeaderModel`.
 *
 * The logo is handled the same way the default theme handles it, because there
 * is only one correct way: the app has already chosen which image this reader
 * gets, so a `<picture>` appears only for the one case it cannot — a reader on
 * "system" with two images to choose between. Midnight is a mono-type theme and
 * still renders somebody's logo unaltered; a theme that restyled a board's own
 * mark would be a theme overruling its operator.
 */
function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) return <>{boardTitle}</>

  const image = (
    <img
      src={logo.src}
      alt={logo.alt}
      className="h-8 w-auto max-w-48 object-contain"
      decoding="async"
    />
  )

  if (logo.darkSrc === null) return image

  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={logo.darkSrc} />
      {image}
    </picture>
  )
}

export function Header({ boardTitle, homeHref, navigation, logo, children }: HeaderModel) {
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border bg-secondary px-4 py-3">
        <a
          href={homeHref}
          className="inline-flex items-center font-mono text-xl font-semibold tracking-tight text-foreground hover:text-primary"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
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
