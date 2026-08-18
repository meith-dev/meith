import type { CategoryBlockModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Frame, MICRO, PanelHead } from '../shared'

export function CategoryBlock({
  category,
  children,
  copy,
}: CategoryBlockModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.categoryBlock.${key}`)

  return (
    <Frame>
      <PanelHead title={category.title} href={category.href} />

      {category.description !== null && (
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          {category.description}
        </p>
      )}

      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className={`${MICRO} text-left`}>
            <th scope="col" className="px-3 py-1.5 font-semibold">
              {c('forum')}
            </th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right font-semibold">
              {c('threads')}
            </th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right font-semibold">
              {c('posts')}
            </th>
            <th scope="col" className="hidden w-60 px-3 py-1.5 font-semibold sm:table-cell">
              {c('lastPost')}
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Frame>
  )
}
