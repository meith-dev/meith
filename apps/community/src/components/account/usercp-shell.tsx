import { PanelShell } from '@/components/shell/panel-shell'
import { getActor } from '@/server/context'
import { getTranslator } from '@/server/i18n'
import { unreadMessageCount } from '@/server/messages'
import { unreadNotificationCount } from '@/server/notifications'
import { buildPanelLinks } from '@/view/shell'

import { UserCpNav } from './usercp-nav'

export async function UserCpShell({ children }: { children: React.ReactNode }) {
  const actor = await getActor()

  const [messages, notifications] = await Promise.all([
    unreadMessageCount(actor.userId),
    unreadNotificationCount(actor.userId),
  ])

  const links = buildPanelLinks({
    t: await getTranslator(),
    current: 'usercp',
    canAccessModCp: actor.global.canAccessModCp === true,
    canAccessAdminCp: actor.global.canAccessAdminCp === true,
  })

  return (
    <PanelShell
      panel="usercp"
      nav={<UserCpNav counts={{ '/messages': messages, '/notifications': notifications }} />}
      links={links}
    >
      {children}
    </PanelShell>
  )
}
