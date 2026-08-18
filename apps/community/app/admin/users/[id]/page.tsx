import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  BanMemberForm,
  LiftBanForm,
  MemberAccountForm,
  MemberStateForm,
  SecondaryGroupsForm,
} from '@/components/admin/user-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { getTranslator, tr } from '@/server/i18n'
import { buildMemberView } from '@/server/user-admin'
import { userAdminCopy } from '@/view/admin-user-copy'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.member') }
}

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await adminPageContext()) === null) return null

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const view = await buildMemberView(Number(id))
  if (view === null) notFound()

  const { member, activeBan } = view
  const now = new Date()
  const translator = await getTranslator()
  const copy = userAdminCopy(translator)

  return (
    <PanelPage
      back={{ href: '/admin/users', label: translator.t('adminUsers.allMembers') }}
      title={member.username}
      gap="loose"
      lede={translator.t('adminUsers.memberLede', {
        id: member.id,
        registered: formatTime(member.createdAt, now, translator).label,
        lastSeen:
          member.lastActiveAt === null
            ? ''
            : translator.t('adminUsers.lastSeen', {
                time: formatTime(member.lastActiveAt, now, translator).label,
              }),
        deleted: member.deletedAt === null ? '' : translator.t('adminUsers.accountDeleted'),
      })}
      meta={translator.t('adminUsers.memberMeta', {
        posts: translator.t('adminUsers.posts', { count: member.postCount }),
        threads: translator.t('adminUsers.threads', { count: member.threadCount }),
        reputation: member.reputation,
        warnings: translator.t('adminUsers.warningPoints', { count: member.warningPoints }),
        email: translator.t(
          member.emailVerifiedAt === null
            ? 'adminUsers.emailUnverified'
            : 'adminUsers.emailVerified',
        ),
      })}
    >
      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminUsers.account')}</h2>
        <MemberAccountForm
          member={{
            id: member.id,
            username: member.username,
            email: member.email,
            primaryGroupId: member.primaryGroupId,
            displayGroupId: member.displayGroupId,
          }}
          groups={view.groups}
          copy={copy}
        />
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.additional-groups')}</h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('adminUsers.additionalGroupsLede')}
        </p>
        <SecondaryGroupsForm
          userId={member.id}
          groups={view.groups}
          selected={view.secondaryGroupIds}
          primaryGroupId={member.primaryGroupId}
          copy={copy}
        />
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminUsers.state')}</h2>
        {activeBan !== null || member.state === 'banned' ? (
          <p className="text-sm text-muted-foreground">
            {translator.t('adminUsers.bannedStateLede')}
          </p>
        ) : (
          <MemberStateForm userId={member.id} state={member.state} copy={copy} />
        )}
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminUsers.ban')}</h2>
        {activeBan === null ? (
          <BanMemberForm userId={member.id} copy={copy} />
        ) : (
          <>
            <p className="text-sm">
              {translator.t('adminUsers.banned')}{' '}
              {activeBan.expiresAt === null ? (
                <strong>{translator.t('adminUsers.permanently')}</strong>
              ) : (
                <>
                  {translator.t('adminUsers.until')}{' '}
                  <time dateTime={activeBan.expiresAt.toISOString()}>
                    {formatTime(activeBan.expiresAt, now, translator).label}
                  </time>
                </>
              )}
              .
            </p>
            {activeBan.reason !== null && (
              <p className="text-sm text-muted-foreground">
                {translator.t('adminUsers.staffNote', { reason: activeBan.reason })}
              </p>
            )}
            {activeBan.publicReason !== null && (
              <p className="text-sm text-muted-foreground">
                {translator.t('adminUsers.shownToMember', { reason: activeBan.publicReason })}
              </p>
            )}
            <LiftBanForm userId={member.id} copy={copy} />
          </>
        )}
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminUsers.merge')}</h2>
        <p className="text-sm text-muted-foreground">{translator.t('adminUsers.mergeLede')}</p>
        <p>
          <a
            href={`/admin/users/${member.id}/merge`}
            className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {translator.t('adminUsers.mergeLink', { username: member.username })}
          </a>
        </p>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{translator.t('adminUsers.network')}</h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('adminUsers.networkLede', {
            registered:
              member.registrationIpPrefix ?? translator.t('adminUsers.addressNotRecorded'),
            lastSeen:
              member.lastIpPrefix === null
                ? ''
                : translator.t('adminUsers.lastSeenFrom', { address: member.lastIpPrefix }),
          })}
        </p>

        {view.sharedNetwork.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {await tr('page.no-other-account-has-been')}
          </p>
        ) : (
          <>
            <p className="text-sm">
              {translator.t('adminUsers.sharedNetwork', { count: view.sharedNetwork.length })}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {view.sharedNetwork.map((row) => (
                <li key={row.id}>
                  <a
                    href={`/admin/users/${row.id}`}
                    className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    {row.username}
                  </a>{' '}
                  <span className="text-xs text-muted-foreground">
                    {row.state === 'active'
                      ? ''
                      : `${row.state === 'banned' ? translator.t('adminUsers.banned') : translator.t('page.awaiting-activation')} · `}
                    {translator.t('adminUsers.posts', { count: row.postCount })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </PanelPage>
  )
}
