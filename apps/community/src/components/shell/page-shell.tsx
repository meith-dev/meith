import type { Actor } from '@meith/authorization'
import { currentRequestId } from '@meith/core/logger'
import { requireSlot, slotCopy } from '@meith/theme-kit'

import { LogoutForm } from '@/components/account/logout-form'
import { InstallBanner } from '@/components/shell/install-banner'
import { NotificationMenu } from '@/components/shell/notification-menu'
import { OnboardingBanner } from '@/components/shell/onboarding-banner'
import { ThemeSwitcher } from '@/components/shell/theme-switcher'
import { avatarsFor } from '@/server/avatars'
import { currentLogo } from '@/server/branding'
import { getContainer } from '@/server/container'
import { getTranslator } from '@/server/i18n'
import { installBanner } from '@/server/install-banner'
import { legalFooterLinks } from '@/server/legal'
import { unreadMessageCount } from '@/server/messages'
import { boardNavigation } from '@/server/navigation'
import { buildNotificationMenuModel } from '@/server/notification-menu'
import { unreadNotificationCount } from '@/server/notifications'
import { onboardingBanner } from '@/server/onboarding'
import { boardRegion, filterView, viewerRef } from '@/server/plugin-view'
import { touchCurrentLocation } from '@/server/presence'
import { registrationOpen } from '@/server/registration'
import { touchActivity } from '@/server/relations'
import { getSettings } from '@/server/settings'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildForumJumpModel } from '@/view/forum-jump'
import { notificationMenuCopy } from '@/view/notification-menu'
import {
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

  return buildForumJumpModel({ rows, visibleForumIds: new Set(visible), t: await getTranslator() })
}

export async function PageShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
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
      : ((
          await getContainer()
            .memberProfiles.findPublicById(actor.userId)
            .catch(() => null)
        )?.username ?? null)

  const ownAvatar =
    actor.userId === null ? null : ((await avatarsFor([actor.userId])).get(actor.userId) ?? null)

  const viewer = buildViewerModel(actor, {
    displayName,
    canAccessAdminCp: actor.global.canAccessAdminCp === true,
    canAccessModCp: actor.global.canAccessModCp === true,
    avatarUrl: ownAvatar,
  })
  const header = buildHeaderModel(
    viewer,
    await boardNavigation(actor, viewer),
    boardTitle,
    await currentLogo(boardTitle),
  )

  const unreadNotifications = await unreadNotificationCount(actor.userId)

  const unreadMessages = await unreadMessageCount(actor.userId)

  const notificationMenu = viewer.isGuest ? null : await buildNotificationMenuModel(actor)

  await touchActivity(actor.userId)

  await touchCurrentLocation()

  const preferences = await getViewerPreferences()

  const pluginContext = { ...viewerRef(actor), requestId: currentRequestId() ?? null }

  const shellModel = await filterView('view.shell', { boardTitle, viewer }, pluginContext)
  const headerModel = await filterView('view.header', header, pluginContext)
  const userPanelModel = await filterView(
    'view.user-panel',
    buildUserPanelModel(viewer, {
      unreadNotifications,
      unreadMessages,
      registrationOpen: await registrationOpen(),
      t: await getTranslator(),
    }),
    pluginContext,
  )
  const footerModel = await filterView(
    'view.footer',
    buildFooterModel(
      await legalFooterLinks(),
      boardTitle,
      preferences.timezone,
      await getTranslator(),
    ),
    pluginContext,
  )

  const built = await buildJumpModel(actor).catch(() => null)
  const jump = built === null ? null : await filterView('view.forum-jump', built, pluginContext)

  const onboarding = await onboardingBanner(actor).catch(() => null)
  const install = await installBanner().catch(() => null)

  const translator = await getTranslator()

  return (
    <Shell
      boardTitle={shellModel.boardTitle}
      viewer={shellModel.viewer}
      copy={slotCopy(theme, 'Shell', translator)}
    >
      <Header {...headerModel} copy={slotCopy(theme, 'Header', translator)}>
        <UserPanel
          {...userPanelModel}
          {...(notificationMenu === null
            ? {}
            : {
                regions: {
                  notifications: (
                    <NotificationMenu
                      model={notificationMenu}
                      copy={notificationMenuCopy(translator)}
                    />
                  ),
                },
              })}
          copy={slotCopy(theme, 'UserPanel', translator)}
        >
          {viewer.isGuest ? null : <LogoutForm label={translator.t('nav.logOut')} />}
        </UserPanel>
      </Header>

      {await boardRegion('header.notice', actor)}

      {install !== null && <InstallBanner {...install} />}
      {onboarding !== null && <OnboardingBanner {...onboarding} />}

      {children}

      <Footer
        {...footerModel}
        regions={{
          controls: (
            <>
              {jump !== null && jump.forums.length > 0 && (
                <ForumJump {...jump} copy={slotCopy(theme, 'ForumJump', translator)} />
              )}
              <ThemeSwitcher />
            </>
          ),
        }}
        copy={slotCopy(theme, 'Footer', translator)}
      />
    </Shell>
  )
}
