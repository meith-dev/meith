import { ModCpShell } from '@/components/moderation/modcp-shell'

export default function ModCpLayout({ children }: { children: React.ReactNode }) {
  return <ModCpShell>{children}</ModCpShell>
}
