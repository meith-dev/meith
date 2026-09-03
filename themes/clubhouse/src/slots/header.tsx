import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

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
          className={`${HEADING} flex min-h-11 items-center px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground`}
        >
          {item.label}
        </a>
      </li>
    )
  }

  return (
    <li>
      <details data-nav-disclosure name="clubhouse-header-submenu" className="group/submenu">
        <summary
          className={`${HEADING} flex min-h-11 cursor-default list-none items-center justify-between gap-2 px-2.5 text-sm text-muted-foreground select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none hover:bg-accent hover:text-foreground`}
        >
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
                className="flex min-h-11 items-center px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
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
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.header.${key}`)

  const opensMenus = navigation.some((item) => item.submenu !== undefined)

  return (
    <header className="relative bg-card">
      <div className={`${PAGE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
        <a
          href={homeHref}
          className="inline-flex min-w-0 items-center gap-3 text-foreground underline-offset-4 hover:underline"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        <div className="flex min-w-0 items-center gap-3">
          {children}
          {navigation.length > 0 && (
            <nav aria-label={c('boardSections')} data-nav-view="mobile" className="lg:hidden">
              <details data-nav-disclosure className="group/menu">
                <summary
                  className={`rounded-md border border-border text-foreground transition-colors hover:bg-primary hover:text-primary-foreground group-open/menu:bg-primary group-open/menu:text-primary-foreground flex size-10 cursor-default list-none items-center justify-center select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none`}
                >
                  <MenuGlyph />
                  <span className="sr-only">{c('boardSections')}</span>
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

      <ClubRule />

      {navigation.length > 0 && (
        <nav
          aria-label={c('boardSections')}
          className="hidden border-b border-border bg-surface lg:block"
        >
          <div className={PAGE}>
            <ul
              data-nav-view="desktop"
              className={`-mx-4 hidden items-stretch px-4 sm:-mx-6 sm:px-6 lg:flex ${
                opensMenus ? 'flex-wrap' : 'overflow-x-auto'
              }`}
            >
              {navigation.map((item) => (
                <li key={item.href} className="group relative shrink-0">
                  <a
                    href={item.href}
                    {...linkTarget(item)}
                    className={`${TAB} border-b-2 border-b-transparent text-muted-foreground hover:border-b-secondary hover:bg-primary hover:text-primary-foreground`}
                  >
                    {item.label}
                  </a>
                  <Submenu items={item.submenu} />
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </header>
  )
}
