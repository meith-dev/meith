import { ModCpShell } from '@/components/moderation/modcp-shell'

export default function ModerationLayout({ children }: { children: React.ReactNode }) {
  return <ModCpShell>{children}</ModCpShell>
}
