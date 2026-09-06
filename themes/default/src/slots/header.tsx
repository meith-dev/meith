import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

import { PAGE } from '../shared'
import { MobileHeaderNav } from './mobile-header-nav'

const DESKTOP_LINK =
  'inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) {
    return (
      <>
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm"
        >
          {(Array.from(boardTitle.trim())[0] ?? '?').toUpperCase()}
        </span>
        <span className="truncate">{boardTitle}</span>
      </>
    )
  }

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

function Submenu({ items }: { items: HeaderModel['navigation'][number]['submenu'] }) {
  if (items === undefined || items.length === 0) return null

  return (
    <ul className="invisible absolute top-full left-0 z-30 min-w-52 rounded-xl border border-border bg-card p-1.5 opacity-0 shadow-elevation transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
      {items.map((child) => (
        <li key={child.href}>
          <a
            href={child.href}
            {...linkTarget(child)}
            className="flex items-center rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground pointer-coarse:min-h-11 hover:bg-muted hover:text-foreground"
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
  const c = (key: string) => fromSlotCopy(copy, `default.header.${key}`)

  const hasNavigation = navigation.length > 0
  const opensMenus = navigation.some(
    (item) => item.submenu !== undefined && item.submenu.length > 0,
  )

  return (
    <header
      data-header-peek
      className="sticky top-0 z-40 border-b border-b-border bg-card/95 backdrop-blur motion-safe:transition-transform motion-safe:duration-200 data-peek:-translate-y-full supports-[backdrop-filter]:bg-card/85"
    >
      <div className={`${PAGE} flex min-h-14 items-center gap-x-3 sm:gap-x-4`}>
        <a
          href={homeHref}
          className="flex min-w-0 items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>

        {hasNavigation && (
          <nav
            aria-label={c('sections')}
            className={
              opensMenus
                ? 'hidden min-w-0 flex-1 lg:block'
                : 'hidden min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none] lg:block'
            }
          >
            <ul
              data-nav-view="desktop"
              className={
                opensMenus
                  ? 'flex flex-wrap items-center gap-0.5 py-1'
                  : 'flex items-center gap-0.5 pr-6 whitespace-nowrap'
              }
            >
              {navigation.map((item) => (
                <li key={item.href} className="group relative shrink-0">
                  <a href={item.href} {...linkTarget(item)} className={DESKTOP_LINK}>
                    {item.label}
                  </a>
                  <Submenu items={item.submenu} />
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="ms-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">{children}</div>

        <MobileHeaderNav boardTitle={boardTitle} navigation={navigation} copy={copy} />
      </div>
    </header>
  )
}
