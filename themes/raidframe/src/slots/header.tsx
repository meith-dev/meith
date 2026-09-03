import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

import { RULE } from '../shared'

function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) {
    return (
      <span className="font-heading text-xl leading-none font-bold tracking-[0.16em] text-foreground uppercase">
        {boardTitle}
      </span>
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
    <ul className="invisible absolute top-full left-0 z-30 min-w-44 rounded-b-md border border-border bg-card py-1 text-sm opacity-0 shadow-elevation transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
      {items.map((child) => (
        <li key={child.href}>
          <a
            href={child.href}
            {...linkTarget(child)}
            className="flex items-center px-3 py-1.5 text-muted-foreground pointer-coarse:min-h-11 hover:bg-muted hover:text-foreground"
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
          className="flex min-h-11 items-center px-3.5 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:bg-secondary hover:text-primary"
        >
          {item.label}
        </a>
      </li>
    )
  }

  return (
    <li>
      <details data-nav-disclosure name="raidframe-header-submenu" className="group/submenu">
        <summary className="flex min-h-11 cursor-default list-none items-center justify-between gap-2 px-3.5 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none hover:bg-secondary hover:text-primary">
          <a
            href={item.href}
            {...linkTarget(item)}
            className="min-w-0 flex-1 truncate normal-case tracking-normal hover:underline"
          >
            {item.label}
          </a>
          <span className="flex size-11 shrink-0 items-center justify-center">
            <Chevron className="size-3 transition-transform group-open/submenu:rotate-90" />
          </span>
        </summary>
        <ul className="ml-3 flex flex-col gap-0.5 border-l border-border py-1 pl-2.5">
          {item.submenu.map((child) => (
            <li key={child.href}>
              <a
                href={child.href}
                {...linkTarget(child)}
                className="flex min-h-11 items-center px-3.5 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:bg-secondary hover:text-primary"
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
  const c = (key: string) => fromSlotCopy(copy, `raidframe.header.${key}`)

  return (
    <header className="relative">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border bg-surface px-4 py-3">
        <a href={homeHref} className="group inline-flex items-center gap-3 hover:text-primary">
          <span
            aria-hidden="true"
            className="size-3.5 rotate-45 border-2 border-primary bg-primary/25 group-hover:bg-primary/50"
          />
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        <div className="flex min-w-0 items-center gap-3">
          {children}
          {navigation.length > 0 && (
            <nav aria-label={c('sectionsAriaLabel')} data-nav-view="mobile" className="lg:hidden">
              <details data-nav-disclosure className="group/menu">
                <summary
                  className={`border border-border bg-card text-foreground hover:border-primary/60 hover:text-primary group-open/menu:border-primary group-open/menu:text-primary flex size-10 cursor-default list-none items-center justify-center select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
                >
                  <MenuGlyph />
                  <span className="sr-only">{c('sectionsAriaLabel')}</span>
                </summary>

                <div className="absolute inset-x-0 top-full z-30 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-card shadow-elevation">
                  <ul className="flex flex-col gap-0.5 px-4 py-2">
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

      <div className={RULE} aria-hidden="true" />

      {navigation.length > 0 && (
        <nav
          aria-label={c('sectionsAriaLabel')}
          className="hidden border-b border-border bg-card/60 lg:block"
        >
          <div data-nav-view="desktop" className="hidden flex-wrap lg:flex">
            {navigation.map((item) => (
              <span key={item.href} className="group relative">
                <a
                  href={item.href}
                  {...linkTarget(item)}
                  className="block border-t-2 border-r border-t-transparent border-r-border px-3.5 py-2 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center hover:border-t-primary hover:bg-secondary hover:text-primary"
                >
                  {item.label}
                </a>
                <Submenu items={item.submenu} />
              </span>
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}
