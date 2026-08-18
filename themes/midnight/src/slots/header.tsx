import type { HeaderModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

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
            <a
              key={item.href}
              href={item.href}
              className="border-r border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
