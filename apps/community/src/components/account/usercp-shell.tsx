import { getActor } from '@/server/context'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import type { PanelLink } from '@/components/shell/panel-links'
import { PanelShell } from '@/components/shell/panel-shell'
import { buildPanelLinks } from '@/view/shell'

import { UserCpNav } from './usercp-nav'

export async function UserCpShell({ children }: { children: React.ReactNode }) {
  const actor = await getActor()

  const [messages, notifications] = await Promise.all([
    unreadMessageCount(actor.userId),
    unreadNotificationCount(actor.userId),
  ])

  const links: readonly PanelLink[] = buildPanelLinks({
    current: 'usercp',
    canAccessModCp: actor.global.canAccessModCp === true,
    canAccessAdminCp: actor.global.canAccessAdminCp === true,
  })

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
