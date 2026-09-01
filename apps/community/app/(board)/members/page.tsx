import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Card, CardRows, Empty, EmptyDescription, EmptyTitle, TextLink } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { identitiesFor } from '@/server/group-identity'
import { getTranslator, tr } from '@/server/i18n'
import {
  MEMBER_DIRECTORY_PAGE,
  memberDirectoryRepository,
  parseMemberDirectorySort,
} from '@/server/member-directory'
import { offsetOf, readPage } from '@/view/pager'
import { formatDate } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.members') }
}

const INPUT =
  'rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const actor = await getActor()
  const { authorizer } = getContainer()
  if (!authorizer.can(actor, 'memberlist.view')) notFound()

  const translator = await getTranslator()
  const repository = memberDirectoryRepository()

  if (repository === null) {
    return (
      <PanelPage frame="standalone" title={await tr('page.members')}>
        <Card>
          <Empty>
            <EmptyTitle>{translator.t('board.memberlist.empty')}</EmptyTitle>
            <EmptyDescription>{translator.t('board.memberlist.needsDatabase')}</EmptyDescription>
          </Empty>
        </Card>
      </PanelPage>
    )
  }

  const params = await searchParams
  const one = (key: string): string => {
    const raw = params[key]
    const text = Array.isArray(raw) ? raw[0] : raw
    return text ?? ''
  }

  const page = readPage(params)
  const sort = parseMemberDirectorySort(one('sort'))
  const name = one('name')

  const result = await repository.page({
    offset: offsetOf(page, MEMBER_DIRECTORY_PAGE),
    limit: MEMBER_DIRECTORY_PAGE,
    sort,
    nameContains: name,
  })
  const identities = await identitiesFor(result.rows.map((row) => row.id))

  return (
    <PanelPage
      frame="standalone"
      title={await tr('page.members')}
      lede={translator.t('board.memberlist.lede', { count: result.total })}
    >
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{translator.t('board.memberlist.search')}</span>
          <input name="name" defaultValue={name} className={INPUT} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{translator.t('board.memberlist.sort')}</span>
          <select name="sort" defaultValue={sort} className={INPUT}>
            <option value="name">{translator.t('board.memberlist.sortName')}</option>
            <option value="posts">{translator.t('board.memberlist.sortPosts')}</option>
            <option value="joined">{translator.t('board.memberlist.sortJoined')}</option>
          </select>
        </label>

        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {translator.t('board.memberlist.apply')}
        </button>
      </form>

      <Card>
        {result.rows.length === 0 ? (
          <Empty>
            <EmptyTitle>{translator.t('board.memberlist.empty')}</EmptyTitle>
          </Empty>
        ) : (
          <CardRows>
            {result.rows.map((row) => {
              const identity = identities.get(row.id)
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <TextLink href={`/member/${row.id}`} className={identity?.nameClass ?? ''}>
                      {row.username}
                    </TextLink>
                    {identity?.groups.map((group) => (
                      <span
                        key={group.groupId}
                        className={`text-xs text-muted-foreground ${group.nameClass ?? ''}`}
                      >
                        {group.title}
                      </span>
                    ))}
                  </span>

                  <span className="shrink-0 text-xs text-muted-foreground">
                    {translator.t('board.memberlist.posts', { count: row.postCount })}
                    {' · '}
                    {translator.t('board.memberlist.joined', {
                      time: formatDate(row.createdAt, translator).label,
                    })}
                  </span>
                </li>
              )
            })}
          </CardRows>
        )}
      </Card>

      <PanelPagination
        path="/members"
        params={params}
        page={page}
        pageSize={MEMBER_DIRECTORY_PAGE}
        total={result.total}
      />
    </PanelPage>
  )
}
