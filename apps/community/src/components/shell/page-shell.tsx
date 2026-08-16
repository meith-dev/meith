import { requireSlot } from '@meith/theme-kit'
import type { Actor } from '@meith/authorization'
import { currentRequestId } from '@meith/core/logger'

import { LogoutForm } from '@/components/account/logout-form'
import { currentLogo } from '@/server/branding'
import { ThemeSwitcher } from '@/components/shell/theme-switcher'
import { getContainer } from '@/server/container'
import { legalFooterLinks } from '@/server/legal'
import { unreadMessageCount } from '@/server/messages'
import { touchActivity } from '@/server/relations'
import { touchCurrentLocation } from '@/server/presence'
import { unreadNotificationCount } from '@/server/notifications'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { getSettings } from '@/server/settings'
import { avatarsFor } from '@/server/avatars'
import { currentTheme } from '@/server/theme'
import { boardRegion, filterView, viewerRef } from '@/server/plugin-view'
import { buildForumJumpModel } from '@/view/forum-jump'
import {
  buildBoardNavigation,
  buildFooterModel,
  buildHeaderModel,
  buildUserPanelModel,
  buildViewerModel,
} from '@/view/shell'

async function buildJumpModel(actor: Actor) {
  const { authorizer, forums } = getContainer()
  const [rows, visible] = await Promise.all([
    forums.listAll(),
    authorizer.forumIdsWhere(actor, 'forum.view'),
  ])

  return buildForumJumpModel({ rows, visibleForumIds: new Set(visible) })
}

export async function PageShell({
  actor,
  children,
}: {
  actor: Actor
  children: React.ReactNode
}) {
  const theme = await currentTheme()
  const Shell = requireSlot(theme, 'Shell')
  const Header = requireSlot(theme, 'Header')
  const UserPanel = requireSlot(theme, 'UserPanel')
  const Footer = requireSlot(theme, 'Footer')
  const ForumJump = requireSlot(theme, 'ForumJump')

  const settings = await getSettings()
  const boardTitle = settings.get('board.name')

  const displayName =
    actor.userId === null
      ? null
      : ((await getContainer()
          .memberProfiles.findPublicById(actor.userId)
          .catch(() => null))?.username ?? null)

  const ownAvatar =
    actor.userId === null
      ? null
      : ((await avatarsFor([actor.userId])).get(actor.userId) ?? null)

  const viewer = buildViewerModel(actor, {
    displayName,
    canAccessAdminCp: actor.global.canAccessAdminCp === true,
    canAccessModCp: actor.global.canAccessModCp === true,
    avatarUrl: ownAvatar,
  })
  const header = buildHeaderModel(
    viewer,
    buildBoardNavigation(viewer),
    boardTitle,
    await currentLogo(boardTitle),
  )

  const unreadNotifications = await unreadNotificationCount(actor.userId)

  const unreadMessages = await unreadMessageCount(actor.userId)

  await touchActivity(actor.userId)

  await touchCurrentLocation()

  const preferences = await getViewerPreferences()

  const pluginContext = { ...viewerRef(actor), requestId: currentRequestId() ?? null }

  const shellModel = await filterView('view.shell', { boardTitle, viewer }, pluginContext)
  const headerModel = await filterView('view.header', header, pluginContext)
  const userPanelModel = await filterView(
    'view.user-panel',
    buildUserPanelModel(viewer, { unreadNotifications, unreadMessages }),
    pluginContext,
  )
  const footerModel = await filterView(
    'view.footer',
    buildFooterModel(await legalFooterLinks(), boardTitle, preferences.timezone),
    pluginContext,
  )

  const built = await buildJumpModel(actor).catch(() => null)
  const jump =
    built === null ? null : await filterView('view.forum-jump', built, pluginContext)

  return (
    <Shell boardTitle={shellModel.boardTitle} viewer={shellModel.viewer}>
      <Header {...headerModel}>
        <UserPanel {...userPanelModel}>
          {viewer.isGuest ? null : <LogoutForm />}
        </UserPanel>
      </Header>

      {await boardRegion('header.notice', actor)}

      {children}

      {jump !== null && jump.forums.length > 0 && <ForumJump {...jump} />}

      <ThemeSwitcher />

      <Footer {...footerModel} />
    </Shell>
  )
}
