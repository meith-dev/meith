import type { NavigationModel } from '@forum/theme-kit'

/**
 * The breadcrumb, as a path rather than as chevrons.
 *
 * The last item is the page you are on, so it is text with `aria-current` and
 * not a link to here — the same accessibility decision the default theme makes,
 * reached independently because it is the correct one rather than because it was
 * copied.
 */
export function Navigation({ items }: NavigationModel) {
  return (
    <nav aria-label="Breadcrumb" className="border-b border-border bg-muted px-4 py-1.5">
      <ol className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex items-center gap-1">
              {index > 0 && <span aria-hidden="true">/</span>}
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
