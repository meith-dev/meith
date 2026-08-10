import type { HeaderModel } from '@meith/theme-kit'

import { LINK, PAGE } from '../shared'

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
    <header className="border-b border-border bg-card">
      <div className={`${PAGE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
        <a
          href={homeHref}
          className={`inline-flex items-center text-xl font-semibold tracking-tight text-foreground ${LINK}`}
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        {children}
      </div>

      {navigation.length > 0 && (
        <nav aria-label="Board sections" className="border-t border-border bg-surface">
          <div className={PAGE}>
            <ul className="-mx-4 flex items-stretch gap-1 overflow-x-auto px-4 text-sm sm:-mx-6 sm:px-6">
              {navigation.map((item) => (
                <li key={item.href} className="shrink-0">
                  <a
                    href={item.href}
                    className="inline-flex h-10 items-center rounded-t-md border-b-2 border-transparent px-2.5 font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
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
