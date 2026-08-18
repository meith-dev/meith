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
            className="block px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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

  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border bg-secondary px-4 py-3">
        <a
          href={homeHref}
          className="inline-flex items-center font-mono text-xl font-semibold tracking-tight text-foreground hover:text-primary"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        {children}
      </div>

      {navigation.length > 0 && (
        <nav aria-label={c('sectionsLabel')} className="flex flex-wrap border-b border-border">
          {navigation.map((item) => (
            <span key={item.href} className="group relative">
              <a
                href={item.href}
                {...linkTarget(item)}
                className="block border-r border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
              <Submenu items={item.submenu} />
            </span>
          ))}
        </nav>
      )}
    </header>
  )
}
