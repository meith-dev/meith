import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Badge, Card, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { getTranslator, tr } from '@/server/i18n'
import { moderatedForumRights, resolveModCpAccess } from '@/server/modcp'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.my-forums') }
}

export default async function ModCpForumsPage() {
  const t = await getTranslator()
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const forums = await moderatedForumRights(access, t)

  return (
    <PanelPage title={t.t('page.my-forums')} lede={t.t('page.where-appointed-exactly-what-may')}>
      <Card>
        {forums.length === 0 ? (
          <Empty className="py-8">
            <EmptyTitle>{t.t('page.no-forum-appointments')}</EmptyTitle>
            <EmptyDescription>{t.t('board.modcp.noAppointmentsHint')}</EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {forums.map((forum) => (
              <li key={forum.forumId} className="flex flex-col gap-2 px-4 py-3">
                <a
                  href={`/${forum.forumId}-${forum.slug}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {forum.title}
                </a>
                {forum.rights.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t.t('page.no-granular-rights-here-group')}
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {forum.rights.map((right) => (
                      <li key={right}>
                        <Badge tone="outline">{right}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </CardRows>
        )}
      </Card>
    </PanelPage>
  )
}
