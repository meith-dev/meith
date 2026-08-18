import { requireSlot, slotCopy } from '@meith/theme-kit'

import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { filterView, viewerRef } from '@/server/plugin-view'
import { currentTheme } from '@/server/theme'
import { buildOffsetPager, buildPager, type OffsetPagerInput, type PagerInput } from '@/view/pager'

export type PanelPaginationProps = OffsetPagerInput | PagerInput

function isNumbered(input: PanelPaginationProps): input is OffsetPagerInput {
  return 'total' in input && typeof input.total === 'number' && 'page' in input
}

export async function PanelPagination(input: PanelPaginationProps) {
  const model = isNumbered(input) ? buildOffsetPager(input) : buildPager(input)
  if (model.previousHref === null && model.nextHref === null) return null

  const theme = await currentTheme()
  const Pagination = requireSlot(theme, 'Pagination')

  return (
    <Pagination
      {...(await filterView('view.pagination', model, viewerRef(await getActor())))}
      copy={slotCopy(theme, 'Pagination', await getTranslator())}
    />
  )
}
