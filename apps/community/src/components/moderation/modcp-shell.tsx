/**
 * The moderator control panel's shell.
 *
 * ## Why a component and not one layout
 *
 * Because the panel straddles two route trees. `/modcp` holds the overview, My
 * communities, the log and the address lookup; `/moderation` holds the approval
 * queue, the reports list and the warn screen — and those three are the panel's
 * whole point. A layout under `/modcp` alone gave a moderator a rail on the
 * screens they check and no rail on the screens they work, which is worse than
 * no rail at all: it teaches them that the panel is somewhere they leave.
 *
 * So both segments have a layout and both layouts are this component. It is the
 * arrangement `UserCpShell` arrived at first, for a member's panel scattered
 * across four trees, and for exactly the same reason.
 *
 * The URLs are not being merged. `/moderation` and `/moderation/reports` are
 * linked from the ACP's overview, the board's account menu and a thread's
 * inline tools; `/moderation/warn?user=` is linked from every postbit and every
 * profile. Moving them for a tidier file tree would break all of that.
 *
 * ## It is not the ACP's shell, and should not be
 *
 * The ACP replaces the board's chrome entirely, because it is a different
 * surface with different authority behind a second password. This one sits
 * *inside* the board — same header, same footer, same theme — because a
 * moderator is signed in as themselves and their powers are the ones the board
 * grants them. What it borrows is the arrangement, through `PanelShell`.
 *
 * ## It gates, and every page under it gates again
 *
 * A layout is not a security boundary in the App Router — a page can be
 * requested directly as an RSC payload — and "the layout checked it" is
 * precisely the assumption that turns into a hole. The double check costs
 * nothing: `resolveModCpAccess` is `React.cache`d.
 */

import { notFound } from "next/navigation";

import { PanelShell } from "@/components/shell/panel-shell";
import type { PanelLink } from "@/components/shell/panel-links";
import { ModCpNav } from "@/components/moderation/modcp-nav";
import { modCpCounts, resolveModCpAccess } from "@/server/modcp";
import { modCpNav } from "@/view/modcp-nav";

export async function ModCpShell({ children }: { children: React.ReactNode }) {
  const access = await resolveModCpAccess();
  if (access === null) notFound();

  const counts = await modCpCounts();

  /*
   * A moderator is a member too, and their own panel is the one they reach for
   * when the queue is clear. The ACP is deliberately absent — see `PanelLinks`.
   */
  const links: readonly PanelLink[] = [
    { href: "/usercp", label: "Your control panel" },
  ];

  return (
    <PanelShell
      nav={
        <ModCpNav
          nav={modCpNav(access)}
          counts={{
            "/moderation": counts.pending,
            "/moderation/reports": counts.openReports,
          }}
        />
      }
      links={links}
    >
      {children}
    </PanelShell>
  );
}
