import { PageShell } from "@/components/shell/page-shell"
import { getActor } from "@/server/context"

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  return <PageShell actor={await getActor()}>{children}</PageShell>
}
