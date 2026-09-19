import type { NavigationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { LABEL, QUIET_LINK, SHELL } from '../shared'

export function Navigation({ items, copy }: NavigationModel & { copy: SlotCopy }) {
  if (items.length === 0) return null

  const c = (key: string) => fromSlotCopy(copy, `meith.navigation.${key}`)

  return (
    <nav aria-label={c('breadcrumb')} className={`${SHELL} pt-5`}>
      <ol className={`${LABEL} flex items-center overflow-x-auto py-1 whitespace-nowrap`}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center">
              {index > 0 && (
                <span aria-hidden="true" className="px-2 text-input select-none">
                  {c('separator')}
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="max-w-[28ch] truncate py-1 text-foreground sm:max-w-none"
                >
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className={`py-1 ${QUIET_LINK}`}>
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
