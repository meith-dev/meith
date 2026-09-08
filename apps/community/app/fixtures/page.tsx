import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { env } from '@meith/core'
import { isSlotName } from '@meith/theme-kit'

import { getTranslator } from '@/server/i18n'
import { FixtureGallery } from '@/theme/gallery.fixture'
import { fixtureVariants } from '@/theme/preview.fixture'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslator()).t('nav.themeFixtures'),
    robots: { index: false, follow: false },
  }
}

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (env.DATA_SOURCE !== 'fixture') notFound()
  const query = await searchParams
  const name = query.slot ?? 'BoardIndex'
  if (typeof name !== 'string' || !isSlotName(name)) notFound()
  const variant = query.variant ?? 'default'
  if (typeof variant !== 'string' || !fixtureVariants(name).includes(variant)) notFound()
  return <FixtureGallery name={name} variant={variant} />
}
