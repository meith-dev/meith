import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export function GET(): NextResponse {
  return NextResponse.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  )
}
