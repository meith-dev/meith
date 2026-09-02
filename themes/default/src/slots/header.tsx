import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

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

function Submenu({ items }: { items: HeaderModel['navigation'][number]['submenu'] }) {
  if (items === undefined || items.length === 0) return null

  return (
    <ul className="invisible absolute top-full left-0 z-30 min-w-44 rounded-b-md border border-border bg-card py-1 opacity-0 shadow-elevation transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
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
          className="flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {item.label}
        </a>
      </li>
    )
  }

  return (
    <li>
      <details data-nav-disclosure name="default-header-submenu" className="group/submenu">
        <summary className="flex min-h-11 cursor-default list-none items-center justify-between gap-2 rounded-md px-2.5 text-sm font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none hover:bg-muted hover:text-foreground">
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
                className="flex min-h-11 items-center rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
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

export function Header({
  boardTitle,
  homeHref,
  navigation,
  logo,
  children,
  copy,
}: HeaderModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.header.${key}`)

  const opensMenus = navigation.some((item) => item.submenu !== undefined)

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
        <nav aria-label={c('sections')} className="border-t border-border bg-surface">
          <div className={PAGE}>
            <ul
              className={`-mx-4 hidden items-stretch gap-1 px-4 text-sm sm:-mx-6 sm:px-6 lg:flex ${
                opensMenus
                  ? 'flex-wrap'
                  : 'overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] sm:[mask-image:none]'
              }`}
            >
              {navigation.map((item) => (
                <li key={item.href} className="group relative shrink-0">
                  <a
                    href={item.href}
                    {...linkTarget(item)}
                    className="inline-flex h-10 items-center rounded-t-md border-b-2 border-transparent px-2.5 font-medium text-muted-foreground transition-colors pointer-coarse:h-11 hover:border-border hover:text-foreground"
                  >
                    {item.label}
                  </a>
                  <Submenu items={item.submenu} />
                </li>
              ))}
            </ul>

            <div className="-mx-4 px-4 py-1 sm:-mx-6 sm:px-6 lg:hidden">
              <details data-nav-disclosure className="group">
                <summary className="flex min-h-11 cursor-default list-none items-center gap-2 text-sm font-medium text-foreground select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                  <Chevron className="size-3 shrink-0 transition-transform group-open:rotate-90" />
                  {c('sections')}
                </summary>
                <ul className="flex flex-col gap-0.5 pb-2">
                  {navigation.map((item) => (
                    <MobileNavItem key={item.href} item={item} />
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </nav>
      )}
    </header>
  )
}
