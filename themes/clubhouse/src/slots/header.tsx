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
  const c = (key: string) => fromSlotCopy(copy, `clubhouse.header.${key}`)

  const opensMenus = navigation.some((item) => item.submenu !== undefined)

  return (
    <header className="bg-card">
      <div className={`${PAGE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
        <a
          href={homeHref}
          className="inline-flex min-w-0 items-center gap-3 text-foreground underline-offset-4 hover:underline"
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        {children}
      </div>

      <ClubRule />

      {navigation.length > 0 && (
        <nav aria-label={c('boardSections')} className="border-b border-border bg-surface">
          <div className={PAGE}>
            <ul
              className={`-mx-4 flex items-stretch px-4 sm:-mx-6 sm:px-6 ${
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
