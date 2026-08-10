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
