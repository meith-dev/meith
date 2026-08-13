import type { NavigationModel } from '@meith/theme-kit'

import { MICRO, MUTED_LINK, PAGE } from '../shared'

export function Navigation({ items }: NavigationModel) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="border-b border-border bg-card">
      <ol
        className={`${PAGE} flex items-center gap-2 overflow-x-auto py-2 whitespace-nowrap ${MICRO}`}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-border select-none">
                  /
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="max-w-[26ch] truncate text-foreground sm:max-w-none"
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
