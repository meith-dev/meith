import 'server-only'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { PATH_HEADER } from './location-header'
import { isSafeLocalPath } from './safe-path'

export async function redirectToCurrentPath(): Promise<void> {
  const path = (await headers()).get(PATH_HEADER)

  if (typeof path === 'string' && isSafeLocalPath(path)) {
    redirect(path)
  }
}
