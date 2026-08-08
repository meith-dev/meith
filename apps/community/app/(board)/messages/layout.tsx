import { UserCpShell } from '@/components/account/usercp-shell'

/**
 * F60's inbox is a section of the member's control panel, so it wears the
 * panel's rail — see `UserCpShell` for why the panel is four route trees and
 * one shell rather than one tree.
 *
 * **No gate here.** `/usercp`'s layout carries one because everything under it
 * needs the same one; these pages already refuse a guest themselves, in their
 * own terms, and a layout is not a security boundary in the App Router anyway.
 * A shell that 404'd would only be a second copy of a check that has to exist
 * on the page regardless.
 */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <UserCpShell>{children}</UserCpShell>
}
