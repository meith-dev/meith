import { notFound } from "next/navigation";

import { PanelShell } from "@/components/shell/panel-shell";
import type { PanelLink } from "@/components/shell/panel-links";
import { ModCpNav } from "@/components/moderation/modcp-nav";
import { getActor } from "@/server/context";
import { modCpCounts, resolveModCpAccess } from "@/server/modcp";
import { modCpNav } from "@/view/modcp-nav";
import { buildPanelLinks } from "@/view/shell";

export async function ModCpShell({ children }: { children: React.ReactNode }) {
  const access = await resolveModCpAccess();
  if (access === null) notFound();

  const counts = await modCpCounts();

  const actor = await getActor();
  const links: readonly PanelLink[] = buildPanelLinks({
    current: "modcp",
    canAccessAdminCp: actor.global.canAccessAdminCp === true,
  });

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
