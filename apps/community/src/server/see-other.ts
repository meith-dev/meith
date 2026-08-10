import 'server-only'

export function seeOther(path: string): Response {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`seeOther expects a path on this board, got: ${path}`)
  }

  return new Response(null, { status: 303, headers: { location: path } })
}
