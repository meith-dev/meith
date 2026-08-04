import { UserCpShell } from '@/components/account/usercp-shell'

/** F56's subscriptions, in the member panel's shell. See `MessagesLayout`. */
export default function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
  return <UserCpShell>{children}</UserCpShell>
}
