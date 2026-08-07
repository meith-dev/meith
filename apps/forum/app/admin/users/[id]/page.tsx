import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  BanMemberForm,
  LiftBanForm,
  MemberAccountForm,
  MemberStateForm,
  SecondaryGroupsForm,
} from '@/components/admin/user-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { requireAdmin } from '@/server/admin'
import { buildMemberView } from '@/server/user-admin'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Member' }

/**
 * F67 — one member.
 *
 * The ban section is the reason this screen exists at all. F23's mechanism has
 * been complete since Phase 2 and had no surface: F54 looked at putting one in
 * the ModCP and named the absence instead, because a create/lift screen needs
 * the member search that is this feature's. This is that screen, and it goes
 * through `BanService` rather than through the state column so there is one
 * place that knows how a ban captures and restores a group.
 *
 * The shared-network list is deliberately worded as a *network*. Only an IP
 * prefix is stored (F19 drops the last octet at write time), so it answers
 * "same network" and not "same machine" — a household, an office and a campus
 * all look like this, and an operator acting on it as proof of a second account
 * would be acting on something the data does not say.
 */
export default async function AdminMemberPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  if (!/^[1-9]\d*$/.test(id)) notFound()

  const view = await buildMemberView(Number(id))
  if (view === null) notFound()

  const { member, activeBan } = view
  const now = new Date()

  return (
    <PanelPage
      back={{ href: '/admin/users', label: 'All members' }}
      title={member.username}
      gap="loose"
      lede={
        <>
          #{member.id} · registered{' '}
          <time dateTime={member.createdAt.toISOString()}>
            {formatTime(member.createdAt, now).label}
          </time>
          {member.lastActiveAt !== null && (
            <>
              {' '}
              · last seen{' '}
              <time dateTime={member.lastActiveAt.toISOString()}>
                {formatTime(member.lastActiveAt, now).label}
              </time>
            </>
          )}
          {member.deletedAt !== null && ' · account deleted'}
        </>
      }
      meta={
        <>
          {member.postCount} post{member.postCount === 1 ? '' : 's'} ·{' '}
          {member.threadCount} thread{member.threadCount === 1 ? '' : 's'} ·{' '}
          {member.reputation} reputation · {member.warningPoints} warning point
          {member.warningPoints === 1 ? '' : 's'} ·{' '}
          {member.emailVerifiedAt === null ? 'email unverified' : 'email verified'}
        </>
      }
    >
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Account</h2>
        <MemberAccountForm
          member={{
            id: member.id,
            username: member.username,
            email: member.email,
            /* F20: handing the stored value to a form control, not deciding on it. */
            // eslint-disable-next-line no-restricted-properties -- F20: transporting the column into a form
            primaryGroupId: member.primaryGroupId,
            displayGroupId: member.displayGroupId,
          }}
          groups={view.groups}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Additional groups</h2>
        <p className="text-sm text-muted-foreground">
          Groups held <em>as well as</em> the primary one. They grant in exactly the same
          way — a member gets the most permissive answer across all of them — so an extra
          group can only ever add.
        </p>
        <SecondaryGroupsForm
          userId={member.id}
          groups={view.groups}
          selected={view.secondaryGroupIds}
          /* F20: the id whose checkbox is suppressed, not a decision about it. */
          // eslint-disable-next-line no-restricted-properties -- F20: transporting the column into a form
          primaryGroupId={member.primaryGroupId}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">State</h2>
        {member.state === 'banned' ? (
          <p className="text-sm text-muted-foreground">
            This member is banned. Lift the ban below to change their state — flipping the
            column here would leave the ban record active.
          </p>
        ) : (
          <MemberStateForm userId={member.id} state={member.state} />
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Ban</h2>
        {activeBan === null ? (
          <BanMemberForm userId={member.id} />
        ) : (
          <>
            <p className="text-sm">
              Banned{' '}
              {activeBan.expiresAt === null ? (
                <strong>permanently</strong>
              ) : (
                <>
                  until{' '}
                  <time dateTime={activeBan.expiresAt.toISOString()}>
                    {formatTime(activeBan.expiresAt, now).label}
                  </time>
                </>
              )}
              .
            </p>
            {activeBan.reason !== null && (
              <p className="text-sm text-muted-foreground">
                Staff note: {activeBan.reason}
              </p>
            )}
            {activeBan.publicReason !== null && (
              <p className="text-sm text-muted-foreground">
                Shown to them: {activeBan.publicReason}
              </p>
            )}
            <LiftBanForm userId={member.id} />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Merge</h2>
        <p className="text-sm text-muted-foreground">
          Fold this account into another one — for a member who registered twice, or a
          duplicate made by an importer.
        </p>
        <p>
          <a
            href={`/admin/users/${member.id}/merge`}
            className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            Merge {member.username} into another account →
          </a>
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-serif text-lg font-semibold">Network</h2>
        <p className="text-sm text-muted-foreground">
          Registered from{' '}
          {member.registrationIpPrefix ?? 'an address that was not recorded'}
          {member.lastIpPrefix !== null && `, last seen from ${member.lastIpPrefix}`}.
          Only a prefix is stored, so these are networks rather than machines.
        </p>

        {view.sharedNetwork.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No other account has been seen on the same network.
          </p>
        ) : (
          <>
            <p className="text-sm">
              {view.sharedNetwork.length} other account
              {view.sharedNetwork.length === 1 ? '' : 's'} on the same network. A
              household, an office and a campus all look like this.
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
                    {row.state === 'active' ? '' : `${row.state} · `}
                    {row.postCount} post{row.postCount === 1 ? '' : 's'}
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
