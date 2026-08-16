import { requireSlot } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'
import { buildPager, type PagerInput } from '@/view/pager'

export async function PanelPagination(input: PagerInput) {
  const model = buildPager(input)
  if (model.previousHref === null && model.nextHref === null) return null

  const Pagination = requireSlot(await currentTheme(), 'Pagination')

  return (
    <Pagination
      {...await filterView('view.pagination', model, viewerRef(await getActor()))}
    />
  )
}
