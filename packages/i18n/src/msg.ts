import { EN_CATALOG } from './catalogs/index'
import { formatMessage, type MessageArgs } from './message'

export interface CatalogMessage {
  readonly key: string
  readonly args?: Readonly<Record<string, string | number>> | undefined
  readonly text: string
}

export function msg(key: string, args?: Readonly<Record<string, string | number>>): CatalogMessage {
  const pattern = EN_CATALOG[key]

  let text = key
  if (pattern !== undefined) {
    try {
      text = formatMessage(pattern, args as MessageArgs, { locale: 'en', timeZone: 'UTC' })
    } catch {
      text = pattern
    }
  }

  return args === undefined ? { key, text } : { key, args, text }
}
