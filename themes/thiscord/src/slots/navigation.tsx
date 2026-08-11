import type { NavigationModel } from '@meith/theme-kit'

import { PAGE } from '../shared'

export function Navigation({ items }: NavigationModel) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="border-b border-border bg-card">
      <ol
        className={`${PAGE} flex items-center gap-1.5 overflow-x-auto py-2.5 text-sm whitespace-nowrap text-muted-foreground`}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="select-none opacity-40">
                  /
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="flex max-w-[24ch] items-center gap-1 truncate font-semibold text-foreground sm:max-w-none"
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="rounded-sm px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
