import { PageShell } from '@/components/shell/page-shell'
import { getActor } from '@/server/context'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PageShell actor={await getActor()}>{children}</PageShell>
}
