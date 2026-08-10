import type { NextRequest } from 'next/server'

import { dispatchPluginRoute } from '@/server/plugin-routes'

export const dynamic = 'force-dynamic'

async function handle(
  request: NextRequest,
  params: Promise<{ key: string; path: string[] }>,
): Promise<Response> {
  const { key, path } = await params
  return dispatchPluginRoute(request, key, path)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string; path: string[] }> },
): Promise<Response> {
  return handle(request, context.params)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ key: string; path: string[] }> },
): Promise<Response> {
  return handle(request, context.params)
}
