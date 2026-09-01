import type { Metadata } from 'next'

import {
  Card,
  CardHeader,
  CardRows,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
  TextLink,
} from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { identitiesFor } from '@/server/group-identity'
import { getTranslator, tr } from '@/server/i18n'
import { memberDirectoryRepository } from '@/server/member-directory'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.staff') }
}

export default async function StaffPage() {
  const translator = await getTranslator()
  const repository = memberDirectoryRepository()
  const staff = repository === null ? [] : await repository.staff()

  if (staff.length === 0) {
    return (
      <PanelPage frame="standalone" title={await tr('page.staff')}>
        <Card>
          <Empty>
            <EmptyTitle>{translator.t('board.staff.empty')}</EmptyTitle>
            <EmptyDescription>
              {translator.t(
                repository === null ? 'board.memberlist.needsDatabase' : 'board.staff.emptyHint',
              )}
            </EmptyDescription>
          </Empty>
        </Card>
      </PanelPage>
    )
  }

  const identities = await identitiesFor(
    staff.flatMap((group) => group.members.map((member) => member.id)),
  )

  return (
    <PanelPage
      frame="standalone"
      title={await tr('page.staff')}
      lede={translator.t('board.staff.lede')}
    >
      {staff.map((group) => (
        <Card key={group.groupId} aria-label={group.title}>
          <CardHeader>
            <CardTitle className="text-sm">{group.title}</CardTitle>
            {group.description !== null && (
              <p className="text-xs text-muted-foreground">{group.description}</p>
            )}
          </CardHeader>
          <CardRows>
            {group.members.map((member) => (
              <li key={member.id} className="px-4 py-3 text-sm">
                <TextLink
                  href={`/member/${member.id}`}
                  className={identities.get(member.id)?.nameClass ?? ''}
                >
                  {member.username}
                </TextLink>
              </li>
            ))}
          </CardRows>
        </Card>
      ))}
    </PanelPage>
  )
}
