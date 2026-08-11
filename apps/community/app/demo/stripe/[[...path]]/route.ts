import type { NextRequest } from 'next/server'

import { handleFakeStripe } from '@/server/demo-stripe'

export const dynamic = 'force-dynamic'

async function handle(
  request: NextRequest,
  params: Promise<{ path?: string[] }>,
): Promise<Response> {
  const { path } = await params
  return handleFakeStripe(request, (path ?? []).join('/'))
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  return handle(request, context.params)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  return handle(request, context.params)
}
