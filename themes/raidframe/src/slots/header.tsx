import type { HeaderModel } from '@meith/theme-kit'

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

export function Header({ boardTitle, homeHref, navigation, logo, children }: HeaderModel) {
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border bg-surface px-4 py-3">
        <a href={homeHref} className="group inline-flex items-center gap-3 hover:text-primary">
          <span
            aria-hidden="true"
            className="size-3.5 rotate-45 border-2 border-primary bg-primary/25 group-hover:bg-primary/50"
          />
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        {children}
      </div>

      <div className={RULE} aria-hidden="true" />

      {navigation.length > 0 && (
        <nav
          aria-label="Board sections"
          className="flex flex-wrap border-b border-border bg-card/60"
        >
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="border-t-2 border-r border-t-transparent border-r-border px-3.5 py-2 font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase hover:border-t-primary hover:bg-secondary hover:text-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
