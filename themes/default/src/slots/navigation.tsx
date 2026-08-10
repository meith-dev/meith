import type { NavigationModel } from '@meith/theme-kit'

import { MUTED_LINK, PAGE } from '../shared'

export function Navigation({ items }: NavigationModel) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="border-b border-border bg-card/40">
      <ol
        className={`${PAGE} flex items-center gap-1.5 overflow-x-auto py-2 text-xs whitespace-nowrap text-muted-foreground`}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="text-border select-none">
                  /
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="max-w-[24ch] truncate font-medium text-foreground sm:max-w-none"
                >
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className={MUTED_LINK}>
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
