/**
 * F86 — MyBB's `member.php`.
 *
 * Three lines, because every legacy route shares one handler: the setting check
 * and the 404 behaviour must not differ between them, and they would with four
 * route files written at four different times.
 */
import type { NextRequest } from 'next/server'

import { serveLegacyUrl } from '@/server/legacy-redirect'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<Response> {
  return serveLegacyUrl(request)
}
