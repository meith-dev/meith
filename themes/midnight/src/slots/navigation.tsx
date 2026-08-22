import type { NavigationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function Navigation({ items, copy }: NavigationModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.navigation.${key}`)

  return (
    <nav aria-label={c('breadcrumbLabel')} className="border-b border-border bg-muted px-4 py-1.5">
      <ol className="flex items-center gap-1 overflow-x-auto font-mono text-xs whitespace-nowrap text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-1">
              {index > 0 && <span aria-hidden="true">/</span>}
              {isLast ? (
                <span
                  aria-current="page"
                  className="max-w-[24ch] truncate text-foreground sm:max-w-none"
                >
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className="hover:text-foreground">
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
