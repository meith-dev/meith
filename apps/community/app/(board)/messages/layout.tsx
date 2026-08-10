import { UserCpShell } from '@/components/account/usercp-shell'

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <UserCpShell>{children}</UserCpShell>
}
