import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

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

function Submenu({ items }: { items: HeaderModel['navigation'][number]['submenu'] }) {
  if (items === undefined || items.length === 0) return null

  return (
    <ul className="invisible absolute top-full left-0 z-30 min-w-44 rounded-xl border border-border bg-card py-1 text-sm opacity-0 shadow-elevation transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
      {items.map((child) => (
        <li key={child.href}>
          <a
            href={child.href}
            {...linkTarget(child)}
            className="block px-4 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {child.label}
          </a>
        </li>
      ))}
    </ul>
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

  const opensMenus = navigation.some((item) => item.submenu !== undefined)

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
                <li key={item.href} className="group relative">
                  <a
                    href={item.href}
                    {...linkTarget(item)}
                    className="inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {item.label}
                  </a>
                  <Submenu items={item.submenu} />
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex shrink-0 items-center justify-end">{children}</div>
      </div>

      {navigation.length > 0 && (
        <nav aria-label={c('sectionsAriaLabel')} className="border-t border-border lg:hidden">
          <ul
            className={`${PAGE} flex items-center gap-1 py-1 ${
              opensMenus ? 'flex-wrap' : 'overflow-x-auto'
            }`}
          >
            {navigation.map((item) => (
              <li key={item.href} className="group relative shrink-0">
                <a
                  href={item.href}
                  {...linkTarget(item)}
                  className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </a>
                <Submenu items={item.submenu} />
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
