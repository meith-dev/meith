import type { CategoryBlockModel } from '@forum/theme-kit'

/**
 * One category and its forums (F29).
 *
 * The heading is a `<h2>` and the rows sit in a list, so the index has a real
 * document outline: a screen-reader user can jump between categories, which on a
 * board with fifteen of them is the difference between navigable and not.
 *
 * A block with no rows still renders its heading. An administrator who has
 * created a category and not yet filled it should see it on the board — an empty
 * category that renders as nothing looks like a save that failed.
 */
export function CategoryBlock({ category, children }: CategoryBlockModel) {
  return (
    <section
      aria-labelledby={`category-${category.id}`}
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="border-b border-border bg-secondary px-4 py-2.5">
        <h2
          id={`category-${category.id}`}
          className="font-serif text-base font-semibold text-secondary-foreground"
        >
          {/*
           * A category is a heading, not a destination: it holds no threads, so
           * linking it would send a reader to an empty forum page. A root-level
           * *forum* used as a block heading is a real place, and is linked.
           */}
          {category.type === 'category' ? (
            category.title
          ) : (
            <a href={category.href} className="hover:text-foreground">
              {category.title}
            </a>
          )}
        </h2>
        {category.description !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">{category.description}</p>
        )}
      </div>

      <ul className="divide-y divide-border">{children}</ul>
    </section>
  )
}
