import 'server-only'

import { isSafeLocalPath } from './safe-path'

export function seeOther(path: string): Response {
  if (!isSafeLocalPath(path)) {
    throw new Error(`seeOther expects a path on this board, got: ${path}`)
  }

  return new Response(null, { status: 303, headers: { location: path } })
}
