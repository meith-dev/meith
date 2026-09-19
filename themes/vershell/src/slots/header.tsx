import { MobileHeaderNav } from '@meith/theme-default'
import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

import { Logomark, SHELL, TOUCH, Wordmark } from '../shared'

const DESKTOP_LINK = `inline-flex h-9 items-center rounded-md px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${TOUCH}`

function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) {
    return (
      <>
        <Logomark className="size-[1.35rem] shrink-0" />
        <Wordmark
          title={boardTitle}
          className="truncate font-heading text-[1.0625rem] font-semibold tracking-[-0.02em] text-foreground"
        />
      </>
    )
  }

  const image = (
    <img
      src={logo.src}
      alt={logo.alt}
      className="h-7 w-auto max-w-48 object-contain"
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
    <ul className="invisible absolute top-full left-0 z-30 mt-1 min-w-52 rounded-[0.75rem] bg-card p-1 opacity-0 shadow-[0_0_0_1px_var(--color-border),0_8px_24px_-8px_var(--shadow-tint)] transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
      {items.map((child) => (
        <li key={child.href}>
          <a
            href={child.href}
            {...linkTarget(child)}
            className={`flex items-center rounded-md px-3 py-2 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${TOUCH}`}
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
  const c = (key: string) => fromSlotCopy(copy, `vershell.header.${key}`)

  const hasNavigation = navigation.length > 0
  const opensMenus = navigation.some(
    (item) => item.submenu !== undefined && item.submenu.length > 0,
  )

  return (
    <header
      data-header-peek
      className="sticky top-0 z-40 bg-background/80 shadow-[0_1px_0_0_var(--color-border)] backdrop-blur-md motion-safe:transition-transform motion-safe:duration-200 data-peek:-translate-y-full"
    >
      <div className={`${SHELL} flex h-16 items-center gap-x-4 sm:gap-x-6`}>
        <a
          href={homeHref}
          className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
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
                  ? 'flex flex-wrap items-center gap-x-1'
                  : 'flex items-center gap-x-1 pr-6 whitespace-nowrap'
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
