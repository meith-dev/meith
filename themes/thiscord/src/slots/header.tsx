import type { HeaderModel } from '@meith/theme-kit'

import { PAGE, Squircle } from '../shared'

function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) return <Squircle name={boardTitle} size={40} />

  const image = (
    <img
      src={logo.src}
      alt=""
      aria-hidden="true"
      className="size-10 shrink-0 rounded-2xl object-cover transition-[border-radius] duration-300 group-hover:rounded-full"
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
    <header className="sticky top-0 z-30 border-b border-border bg-card shadow-elevation">
      <div className={`${PAGE} flex h-14 items-center justify-between gap-3`}>
        <a href={homeHref} className="group flex min-w-0 shrink-0 items-center gap-2.5">
          <BoardMark boardTitle={boardTitle} logo={logo} />
          <span className="hidden truncate text-base font-bold tracking-tight text-foreground sm:inline">
            {boardTitle}
          </span>
        </a>

        {navigation.length > 0 && (
          <nav aria-label="Board sections" className="hidden min-w-0 flex-1 lg:block">
            <ul className="flex items-center gap-0.5">
              {navigation.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="inline-flex h-8 items-center rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex shrink-0 items-center justify-end">{children}</div>
      </div>

      {navigation.length > 0 && (
        <nav aria-label="Board sections" className="border-t border-border lg:hidden">
          <ul className={`${PAGE} flex items-center gap-0.5 overflow-x-auto py-1`}>
            {navigation.map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="inline-flex h-8 items-center rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
