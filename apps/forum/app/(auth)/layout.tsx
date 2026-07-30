import { requireSlot, resolveTheme } from "@forum/theme-kit"

import { getActor } from "@/server/context"
import {
  buildFooterModel,
  buildHeaderModel,
  buildUserPanelModel,
  buildViewerModel,
} from "@/view/shell"

/*
 * Read the theme through the registry, never by importing @forum/theme-default
 * directly (invariant 6). Installing a second theme must not mean editing a
 * layout — which is exactly what this layout used to require, since it carried
 * its own markup.
 */
import forumConfig from "../../forum.config"

/**
 * Chrome shared by every auth screen, and the first page rendered through the
 * theme's slots (F25).
 *
 * ## Why the layout composes the slots
 *
 * `Shell`, `Header`, `UserPanel` and `Footer` are resolved here and composed in
 * order. A slot never renders another slot: that would need the resolved theme
 * *inside* a slot, which a Server Component cannot get hold of (no context), and
 * it would quietly break inheritance — a child theme overriding `Header` would be
 * ignored inside its parent's `Shell`. One place resolves slots, so an override
 * applies everywhere.
 *
 * The centered card stays in the layout rather than becoming a slot: it is this
 * route group's shape, not a board-wide region a theme replaces.
 */

/*
 * Resolved once at module load, like the theme lookup in the root layout: the
 * chain is static, so there is nothing per-request about it.
 *
 * The `!`s are load-bearing rather than lazy. `defineForumConfig` has already
 * proven `defaultTheme` names a registered theme, and `theme` is optional in the
 * registry because a token-only theme is legitimate — but a board whose theme
 * fills no slots cannot render a page, so failing here at boot is right. The
 * alternative, rendering an unstyled page, is the failure mode that takes a day
 * to diagnose.
 */
const activeTheme = resolveTheme(forumConfig.themes[forumConfig.defaultTheme]!.theme!)

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const Shell = requireSlot(activeTheme, "Shell")
  const Header = requireSlot(activeTheme, "Header")
  const UserPanel = requireSlot(activeTheme, "UserPanel")
  const Footer = requireSlot(activeTheme, "Footer")

  /*
   * The real actor, not an assumption. These screens are for people who are not
   * signed in, but a signed-in visitor reaching /register should not be told
   * "Not signed in". No display name is resolved: it would cost a user read on a
   * page with no use for one (see buildViewerModel).
   */
  const viewer = buildViewerModel(await getActor())
  const header = buildHeaderModel(viewer)

  return (
    <Shell boardTitle={header.boardTitle} viewer={viewer}>
      <Header {...header}>
        <UserPanel {...buildUserPanelModel(viewer)} />
      </Header>

      <main
        id="board-content"
        className="flex flex-1 flex-col items-center justify-center px-6 py-12"
      >
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          {children}
        </div>
      </main>

      <Footer {...buildFooterModel()} />
    </Shell>
  )
}
