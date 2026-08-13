import type { HeaderModel } from '@meith/theme-kit'

import { ClubRule, Crest, HEADING, PAGE, TAB } from '../shared'

function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) {
    return (
      <>
        <Crest title={boardTitle} />
        <span className={`${HEADING} text-lg leading-none text-balance sm:text-xl`}>
          {boardTitle}
        </span>
      </>
    )
  }

  const image = (
    <img
      src={logo.src}
      alt={logo.alt}
      className="h-9 w-auto max-w-48 object-contain"
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
    <header className="bg-card">
      <div className={`${PAGE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
        <a
          href={homeHref}
          className="inline-flex min-w-0 items-center gap-3 text-foreground underline-offset-4 hover:underline"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        {children}
      </div>

      <ClubRule />

      {navigation.length > 0 && (
        <nav aria-label="Board sections" className="border-b border-border bg-surface">
          <div className={PAGE}>
            <ul className="-mx-4 flex items-stretch overflow-x-auto px-4 sm:-mx-6 sm:px-6">
              {navigation.map((item) => (
                <li key={item.href} className="shrink-0">
                  <a
                    href={item.href}
                    className={`${TAB} border-b-2 border-b-transparent text-muted-foreground hover:border-b-secondary hover:bg-primary hover:text-primary-foreground`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </header>
  )
}
