import { getActor } from '@/server/context'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import type { PanelLink } from '@/components/shell/panel-links'
import { PanelShell } from '@/components/shell/panel-shell'

import { UserCpNav } from './usercp-nav'

export async function UserCpShell({ children }: { children: React.ReactNode }) {
  const actor = await getActor()

  const [messages, notifications] = await Promise.all([
    unreadMessageCount(actor.userId),
    unreadNotificationCount(actor.userId),
  ])

  const links: readonly PanelLink[] =
    actor.global.canAccessModCp === true
      ? [{ href: '/modcp', label: 'Moderator CP' }]
      : []

  return (
    <PanelShell
      nav={
        <UserCpNav counts={{ '/messages': messages, '/notifications': notifications }} />
      }
      links={links}
    >
      {children}
    </PanelShell>
  )
}
