import type { CategoryBlockModel } from '@meith/theme-kit'

import { CARD, LEDE, QUIET_LINK, SECTION_TITLE } from '../shared'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
  const headingId = `category-${category.id}`

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id={headingId} className={SECTION_TITLE}>
          <a href={category.href} className={QUIET_LINK}>
            {category.title}
          </a>
        </h2>
        {category.description !== null && (
          <p className={`${LEDE} text-[0.875rem] leading-relaxed`}>{category.description}</p>
        )}
      </div>

      <div className={`${CARD} @container/card px-4 sm:px-6`}>
        <ul data-slot="card-rows">{children}</ul>
      </div>
    </section>
  )
}
