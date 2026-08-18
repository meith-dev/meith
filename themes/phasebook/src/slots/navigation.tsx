import type { NavigationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { PAGE } from '../shared'

export function Navigation({ items, copy }: NavigationModel & { copy: SlotCopy }) {
  if (items.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `phasebook.navigation.${key}`)

  return (
    <nav aria-label={c('ariaLabel')} className="bg-background">
      <ol
        className={`${PAGE} flex items-center gap-1 overflow-x-auto pt-3 text-sm whitespace-nowrap text-muted-foreground`}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-1">
              {index > 0 && (
                <span aria-hidden="true" className="select-none opacity-50">
                  ›
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="max-w-[24ch] truncate font-semibold text-foreground sm:max-w-none"
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-accent hover:text-foreground"
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
