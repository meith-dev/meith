import { requireSlot } from '@forum/theme-kit'
import type { Actor } from '@forum/authorization'

import { LogoutForm } from '@/components/account/logout-form'
import { activeTheme } from '@/server/theme'
import {
  buildFooterModel,
  buildHeaderModel,
  buildUserPanelModel,
  buildViewerModel,
} from '@/view/shell'

/**
 * The chrome every page renders inside (F27).
 *
 * ## Why this exists rather than each layout composing slots itself
 *
 * A slot never renders another slot — the page or layout resolves them and
 * composes (D35). Left there, every layout would repeat the same four
 * `requireSlot` calls and the same four builders, and they would drift: the auth
 * screens would grow a header the board pages do not have, or lose one they
 * should. So the composition lives here, once, and layouts hand it their body.
 *
 * It is not a theme slot itself, deliberately. The *order* of header, body and
 * footer is the application's structure; what each of those looks like is the
 * theme's. A theme that wants a sidebar overrides `Shell` and gets the same
 * children.
 */
export async function PageShell({
  actor,
  children,
}: {
  actor: Actor
  children: React.ReactNode
}) {
  const Shell = requireSlot(activeTheme, 'Shell')
  const Header = requireSlot(activeTheme, 'Header')
  const UserPanel = requireSlot(activeTheme, 'UserPanel')
  const Footer = requireSlot(activeTheme, 'Footer')

  /*
   * `canAccessModCp` is a permission field, not a group check — the same rule
   * `canAccessAdminCp` follows. It is read off the already-resolved actor, so
   * the shell costs no extra query on any page (F48).
   */
  const viewer = buildViewerModel(actor, {
    canAccessModCp: actor.global.canAccessModCp === true,
  })
  const header = buildHeaderModel(viewer)

  return (
    <Shell boardTitle={header.boardTitle} viewer={viewer}>
      <Header {...header}>
        <UserPanel {...buildUserPanelModel(viewer)}>
          {/*
           * Only for a signed-in viewer, and only as a form: log out is a POST to
           * a Server Action, which cannot cross into the theme as data. A theme
           * decides where in the panel it sits, not whether it exists.
           */}
          {viewer.isGuest ? null : <LogoutForm />}
        </UserPanel>
      </Header>

      {children}

      <Footer {...buildFooterModel()} />
    </Shell>
  )
}
