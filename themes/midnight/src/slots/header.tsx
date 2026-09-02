import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy, linkTarget } from '@meith/theme-kit'

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
          className="flex min-h-11 items-center px-3 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {item.label}
        </a>
      </li>
    )
  }

  return (
    <li>
      <details data-nav-disclosure name="midnight-header-submenu" className="group/submenu">
        <summary className="flex min-h-11 cursor-default list-none items-center justify-between gap-2 px-3 font-mono text-xs uppercase tracking-wide text-muted-foreground select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none hover:bg-muted hover:text-foreground">
          <a
            href={item.href}
            {...linkTarget(item)}
            className="min-w-0 flex-1 truncate hover:underline"
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
                className="flex min-h-11 items-center px-3 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
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
  const c = (key: string) => fromSlotCopy(copy, `midnight.header.${key}`)

  const opensMenus = navigation.some((item) => item.submenu !== undefined)

  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border bg-secondary px-4 py-3 sm:px-6">
        <a
          href={homeHref}
          className="inline-flex items-center font-mono text-xl font-semibold tracking-tight text-foreground hover:text-primary"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        {children}
      </div>

      {navigation.length > 0 && (
        <nav aria-label={c('sectionsLabel')} className="border-b border-border px-4 sm:px-6">
          <div
            data-nav-view="desktop"
            className={`-mx-4 hidden px-4 sm:-mx-6 sm:px-6 lg:flex ${
              opensMenus
                ? 'flex-wrap'
                : 'overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] sm:[mask-image:none]'
            }`}
          >
            {navigation.map((item) => (
              <span key={item.href} className="group relative shrink-0">
                <a
                  href={item.href}
                  {...linkTarget(item)}
                  className="block border-r border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:flex pointer-coarse:items-center hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </a>
                <Submenu items={item.submenu} />
              </span>
            ))}
          </div>

          <div data-nav-view="mobile" className="-mx-4 px-4 py-1 sm:-mx-6 sm:px-6 lg:hidden">
            <details data-nav-disclosure className="group">
              <summary className="flex min-h-11 cursor-default list-none items-center gap-2 font-mono text-xs uppercase tracking-wide text-foreground select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                <Chevron className="size-3 shrink-0 transition-transform group-open:rotate-90" />
                {c('sectionsLabel')}
              </summary>
              <ul className="flex flex-col gap-0.5 pb-2">
                {navigation.map((item) => (
                  <MobileNavItem key={item.href} item={item} />
                ))}
              </ul>
            </details>
          </div>
        </nav>
      )}
    </header>
  )
}
