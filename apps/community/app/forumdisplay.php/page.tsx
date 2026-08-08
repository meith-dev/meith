/**
 * F86 — MyBB's `forumdisplay.php`.
 *
 * Three lines, because every legacy URL shares one handler: the setting check
 * and the 404 behaviour must not differ between them, and they would with three
 * files written at three different times.
 *
 * A page rather than a route handler, because the 404 is half of what this
 * feature does and a route handler cannot render one. See `serveLegacyUrl`.
 */
import { serveLegacyUrl } from '@/server/legacy-redirect'

export const dynamic = 'force-dynamic'

export default async function ForumDisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<never> {
  return serveLegacyUrl('forumdisplay.php', await searchParams)
}
