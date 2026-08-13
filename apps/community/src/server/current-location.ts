import 'server-only'

import { headers } from 'next/headers'
import { cache } from 'react'

import { PATH_HEADER, QUERY_HEADER } from './location-header'

export const currentLocation = cache(async (): Promise<string> => {
  try {
    const jar = await headers()
    const path = jar.get(PATH_HEADER)
    if (typeof path !== 'string' || !path.startsWith('/')) return ''

    const query = jar.get(QUERY_HEADER)
    return typeof query === 'string' && query.startsWith('?') ? `${path}${query}` : path
  } catch {
    return ''
  }
})
