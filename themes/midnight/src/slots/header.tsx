import { MobileHeaderNav } from '@meith/theme-default'
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
    <header className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary px-4 py-3 sm:px-6">
        <a
          href={homeHref}
          className="inline-flex items-center font-mono text-xl font-semibold tracking-tight text-foreground hover:text-primary"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        <div className="flex min-w-0 items-center gap-3">
          {children}
          <MobileHeaderNav boardTitle={boardTitle} navigation={navigation} copy={copy} />
        </div>
      </div>

      {navigation.length > 0 && (
        <nav
          aria-label={c('sectionsLabel')}
          className="hidden border-b border-border px-4 sm:px-6 lg:block"
        >
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
        </nav>
      )}
    </header>
  )
}
