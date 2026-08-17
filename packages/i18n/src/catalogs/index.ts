import type { CatalogSource, MessageCatalog } from '../catalog'
import { SOURCE_LOCALE } from '../locale'
import en from './en.json'

export const BOARD_CATALOG_ID = 'meith'

export const EN_CATALOG: MessageCatalog = en

export const BOARD_CATALOG: CatalogSource = {
  id: BOARD_CATALOG_ID,
  messages: { [SOURCE_LOCALE]: EN_CATALOG },
}
