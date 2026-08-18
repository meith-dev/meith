import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { PAGE } from '../shared'

function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) {
    const initial = (Array.from(boardTitle.trim())[0] ?? '?').toUpperCase()
    return (
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground"
      >
        {initial}
      </span>
    )
  }

  const image = (
    <img
      src={logo.src}
      alt=""
      aria-hidden="true"
      className="size-10 shrink-0 rounded-full object-cover"
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

export function Header({
  boardTitle,
  homeHref,
  navigation,
  logo,
  children,
  copy,
}: HeaderModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.header.${key}`)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card shadow-elevation">
      <div className={`${PAGE} flex h-14 items-center justify-between gap-3`}>
        <a
          href={homeHref}
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-full transition-opacity hover:opacity-80"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
          <span className="hidden truncate text-lg font-bold tracking-tight text-foreground sm:inline">
            {boardTitle}
          </span>
        </a>

        {navigation.length > 0 && (
          <nav
            aria-label={c('sectionsAriaLabel')}
            className="hidden min-w-0 flex-1 justify-center lg:flex"
          >
            <ul className="flex items-center gap-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex shrink-0 items-center justify-end">{children}</div>
      </div>

      {navigation.length > 0 && (
        <nav aria-label={c('sectionsAriaLabel')} className="border-t border-border lg:hidden">
          <ul className={`${PAGE} flex items-center gap-1 overflow-x-auto py-1`}>
            {navigation.map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
