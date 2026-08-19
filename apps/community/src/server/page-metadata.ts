import 'server-only'

import { filterView } from './plugin-view'

export interface PageMetadata {
  readonly title: string
  readonly description: string | null
  readonly canonical: string
  readonly imageUrl: string | null
}

export async function pageMetadata(route: string, page: PageMetadata): Promise<PageMetadata> {
  return filterView('metadata.page', page, { route })
}
