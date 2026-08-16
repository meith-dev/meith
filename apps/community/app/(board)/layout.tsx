import { OfflineNotice } from "@/components/shell/offline-notice"
import { PageShell } from "@/components/shell/page-shell"
import { boardOffline } from "@/server/board-offline"
import { getActor } from "@/server/context"

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const offline = await boardOffline()
  if (offline !== null) return <OfflineNotice message={offline.message} />

  return <PageShell actor={await getActor()}>{children}</PageShell>
}
