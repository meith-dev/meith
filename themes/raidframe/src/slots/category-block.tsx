import type { CategoryBlockModel } from '@meith/theme-kit'

import { Frame, MICRO, PanelHead } from '../shared'

export function CategoryBlock({ category, children }: CategoryBlockModel) {
  return (
    <Frame>
      <PanelHead title={category.title} href={category.href} />

      {category.description !== null && (
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          {category.description}
        </p>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={`${MICRO} text-left`}>
            <th scope="col" className="px-3 py-1.5 font-semibold">
              Forum
            </th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right font-semibold">
              Threads
            </th>
            <th scope="col" className="w-16 px-2 py-1.5 text-right font-semibold">
              Posts
            </th>
            <th scope="col" className="hidden w-60 px-3 py-1.5 font-semibold sm:table-cell">
              Last post
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Frame>
  )
}
