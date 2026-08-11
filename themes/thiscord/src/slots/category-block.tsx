import type { CategoryBlockModel } from '@meith/theme-kit'

import { CATEGORY_HEADING, PANEL } from '../shared'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
  const headingId = `category-${category.id}`

  return (
    <section aria-labelledby={headingId} className={PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 pt-3 pb-1.5">
        <h2 id={headingId} className={CATEGORY_HEADING}>
          <a href={category.href} className="hover:text-foreground">
            {category.title}
          </a>
        </h2>
        {category.description !== null && (
          <p className="text-xs text-muted-foreground">{category.description}</p>
        )}
      </div>

      <ul className="flex flex-col gap-0.5 px-2 pb-2">{children}</ul>
    </section>
  )
}
