import type { NavigationModel } from '@forum/theme-kit'

/**
 * The breadcrumb trail (F27).
 *
 * `<nav aria-label>` plus an ordered list, because a breadcrumb is a sequence and
 * screen readers announce it as one. The final item is the current page: it is
 * marked `aria-current` and is not a link, since linking a page to itself is a
 * dead control that keyboard users still have to tab through.
 */
export function Navigation({ items }: NavigationModel) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-border bg-background/60"
    >
      <ol className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-6 py-2 text-xs text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">›</span>}
              {isLast ? (
                <span aria-current="page" className="text-foreground">
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
