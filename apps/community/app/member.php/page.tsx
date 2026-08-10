import { serveLegacyUrl } from '@/server/legacy-redirect'

export const dynamic = 'force-dynamic'

export default async function MemberPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<never> {
  return serveLegacyUrl('member.php', await searchParams)
}
