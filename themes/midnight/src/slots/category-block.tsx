import type { CategoryBlockModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function CategoryBlock({
  category,
  children,
  copy,
}: CategoryBlockModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.categoryBlock.${key}`)

  return (
    <section className="border border-border">
      <h2 className="border-b border-border bg-secondary px-3 py-1.5 font-mono text-sm font-semibold uppercase tracking-wide">
        <a href={category.href} className="hover:text-primary">
          {category.title}
        </a>
      </h2>
      {category.description !== null && (
        <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
          {category.description}
        </p>
      )}
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col className="hidden w-16 md:table-column" />
          <col className="hidden w-16 md:table-column" />
          <col className="hidden w-64 md:table-column" />
        </colgroup>
        <thead className="sr-only md:not-sr-only md:table-header-group">
          <tr className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
            <th scope="col" className="px-3 py-1 text-left font-normal">
              {c('forumHeader')}
            </th>
            <th scope="col" className="hidden px-2 py-1 text-right font-normal md:table-cell">
              {c('threadsHeader')}
            </th>
            <th scope="col" className="hidden px-2 py-1 text-right font-normal md:table-cell">
              {c('postsHeader')}
            </th>
            <th scope="col" className="hidden px-3 py-1 text-left font-normal md:table-cell">
              {c('lastPostHeader')}
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  )
}
