import type { CategoryBlockModel } from '@meith/theme-kit'

import { EDITORIAL_RULE, LEDE, QUIET_LINK, SECTION_TITLE, Wordmark } from '../shared'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
  const headingId = `category-${category.id}`

  return (
    <section aria-labelledby={headingId} className={`${EDITORIAL_RULE} @container/card pt-5`}>
      <div className="flex flex-col gap-2 pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <h2 id={headingId} className={SECTION_TITLE}>
          <a href={category.href} className={QUIET_LINK}>
            <Wordmark title={category.title} />
          </a>
        </h2>
        {category.description !== null && (
          <p className={`${LEDE} text-[0.85rem] leading-relaxed sm:max-w-[26rem] sm:text-end`}>
            {category.description}
          </p>
        )}
      </div>

      <ul data-slot="card-rows" className="@container/card">
        {children}
      </ul>
    </section>
  )
}
