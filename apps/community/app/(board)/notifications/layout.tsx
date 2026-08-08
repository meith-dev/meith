import { UserCpShell } from '@/components/account/usercp-shell'

/** F55's notifications, in the member panel's shell. See `MessagesLayout`. */
export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <UserCpShell>{children}</UserCpShell>
}
