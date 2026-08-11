import type { CategoryBlockModel } from '@meith/theme-kit'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
  const headingId = `category-${category.id}`

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-3 pb-2">
        <h2 id={headingId} className="text-[1.0625rem] font-bold tracking-tight">
          <a href={category.href} className="hover:underline">
            {category.title}
          </a>
        </h2>
        {category.description !== null && (
          <p className="text-xs text-muted-foreground">{category.description}</p>
        )}
      </div>

      <ul className="divide-y divide-border border-t border-border">{children}</ul>
    </section>
  )
}
