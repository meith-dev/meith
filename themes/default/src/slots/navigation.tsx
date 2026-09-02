import type { NavigationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { PAGE } from '../shared'

export function Navigation({ items, copy }: NavigationModel & { copy: SlotCopy }) {
  if (items.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `default.navigation.${key}`)

  return (
    <nav aria-label={c('breadcrumb')} className={`${PAGE} pt-4`}>
      <ol className="-mx-1.5 flex items-center overflow-x-auto py-0.5 text-xs whitespace-nowrap text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center">
              {index > 0 && (
                <span aria-hidden="true" className="px-0.5 text-border select-none">
                  {c('separator')}
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="max-w-[24ch] truncate px-1.5 py-1 font-medium text-foreground sm:max-w-none"
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
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
