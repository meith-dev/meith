import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

import { BELOW_HEADER, HEADER_HEIGHT, PAGE } from '../shared'

const DESKTOP_LINK =
  'inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

const MOBILE_LINK =
  'flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground'

const SUMMARY =
  'cursor-default list-none select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none'

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
    <ul className="invisible absolute top-full left-0 z-30 mt-1 min-w-52 rounded-xl border border-border bg-card p-1.5 opacity-0 shadow-elevation transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
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

function MobileNavItem({ item }: { item: HeaderModel['navigation'][number] }) {
  if (item.submenu === undefined || item.submenu.length === 0) {
    return (
      <li>
        <a href={item.href} {...linkTarget(item)} className={MOBILE_LINK}>
          {item.label}
        </a>
      </li>
    )
  }

  return (
    <li>
      <details data-nav-disclosure name="default-header-submenu" className="group/submenu">
        <summary
          className={`${SUMMARY} flex min-h-11 items-center justify-between gap-2 rounded-lg pl-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground`}
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
        <ul className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-border py-1 pl-2">
          {item.submenu.map((child) => (
            <li key={child.href}>
              <a href={child.href} {...linkTarget(child)} className={MOBILE_LINK}>
                {child.label}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </li>
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
    <header className="sticky top-0 z-40 border-b border-b-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className={`${PAGE} flex ${HEADER_HEIGHT} items-center gap-x-3 sm:gap-x-4`}>
        <a
          href={homeHref}
          className="me-auto flex min-w-0 items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>

        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">{children}</div>

        {hasNavigation && (
          <nav aria-label={c('sections')} data-nav-view="mobile" className="lg:hidden">
            <details data-nav-disclosure className="group/menu">
              <summary
                className={`${SUMMARY} flex size-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary/40 hover:text-primary group-open/menu:border-primary/40 group-open/menu:bg-primary/8 group-open/menu:text-primary`}
              >
                <MenuGlyph />
                <span className="sr-only">{c('sections')}</span>
              </summary>

              <div
                className={`absolute inset-x-0 ${BELOW_HEADER} z-30 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-border bg-card shadow-elevation`}
              >
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

      {hasNavigation && (
        <nav aria-label={c('sections')} className="hidden border-t border-border lg:block">
          <div
            className={
              opensMenus
                ? PAGE
                : `${PAGE} overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none]`
            }
          >
            <ul
              data-nav-view="desktop"
              className={
                opensMenus
                  ? '-mx-3 flex flex-wrap items-center gap-0.5 py-1'
                  : '-mx-3 flex items-center gap-0.5 py-1 pr-6 whitespace-nowrap'
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
          </div>
        </nav>
      )}
    </header>
  )
}
