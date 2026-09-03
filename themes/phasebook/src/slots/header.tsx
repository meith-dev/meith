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
            className="flex items-center px-4 py-2 text-muted-foreground pointer-coarse:min-h-11 hover:bg-accent hover:text-foreground"
          >
            {child.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function Chevron({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4.5 3 3 3-3 3" />
    </svg>
  )
}

function MobileNavItem({ item }: { item: HeaderModel['navigation'][number] }) {
  if (item.submenu === undefined || item.submenu.length === 0) {
    return (
      <li>
        <a
          href={item.href}
          {...linkTarget(item)}
          className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {item.label}
        </a>
      </li>
    )
  }

  return (
    <li>
      <details data-nav-disclosure name="phasebook-header-submenu" className="group/submenu">
        <summary className="flex min-h-11 cursor-default list-none items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none hover:bg-accent hover:text-foreground">
          <a
            href={item.href}
            {...linkTarget(item)}
            className="min-w-0 flex-1 truncate hover:underline"
          >
            {item.label}
          </a>
          <span className="flex size-11 shrink-0 items-center justify-center">
            <Chevron className="size-3 text-muted-foreground transition-transform group-open/submenu:rotate-90" />
          </span>
        </summary>
        <ul className="ml-2 flex flex-col gap-0.5 border-l border-border py-1 pl-2.5">
          {item.submenu.map((child) => (
            <li key={child.href}>
              <a
                href={child.href}
                {...linkTarget(child)}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {child.label}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

function MenuGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path className="group-open/menu:hidden" d="M3 5.5h14M3 10h14M3 14.5h14" />
      <path className="hidden group-open/menu:block" d="m5 5 10 10M15 5 5 15" />
    </svg>
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
            data-nav-view="desktop"
            className="hidden min-w-0 flex-1 justify-center lg:flex"
          >
            <ul className="flex items-center gap-0.5 whitespace-nowrap">
              {navigation.map((item) => (
                <li key={item.href} className="group relative shrink-0">
                  <a
                    href={item.href}
                    {...linkTarget(item)}
                    className="inline-flex h-10 items-center rounded-lg px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground xl:px-5"
                  >
                    {item.label}
                  </a>
                  <Submenu items={item.submenu} />
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex shrink-0 items-center justify-end gap-2">
          {children}
          {navigation.length > 0 && (
            <nav aria-label={c('sectionsAriaLabel')} data-nav-view="mobile" className="lg:hidden">
              <details data-nav-disclosure className="group/menu">
                <summary
                  className={`rounded-full text-foreground transition-colors hover:bg-accent group-open/menu:bg-accent flex size-10 cursor-default list-none items-center justify-center select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
                >
                  <MenuGlyph />
                  <span className="sr-only">{c('sectionsAriaLabel')}</span>
                </summary>

                <div className="absolute inset-x-0 top-full z-30 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-card shadow-elevation">
                  <ul className={`${PAGE} flex flex-col gap-0.5 py-2`}>
                    {navigation.map((item) => (
                      <MobileNavItem key={item.href} item={item} />
                    ))}
                  </ul>
                </div>
              </details>
            </nav>
          )}
        </div>
      </div>
    </header>
  )
}
