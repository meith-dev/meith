import type { NavigationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function Navigation({ items, copy }: NavigationModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.navigation.${key}`)

  return (
    <nav aria-label={c('ariaLabel')} className="border-b border-border bg-card/40 px-4 py-2">
      <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="text-primary/60">
                  ›
                </span>
              )}
              {isLast ? (
                <span aria-current="page" className="font-semibold text-foreground">
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className="hover:text-primary">
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
