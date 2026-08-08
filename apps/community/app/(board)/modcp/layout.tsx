import { ModCpShell } from '@/components/moderation/modcp-shell'

/**
 * F54 — the ModCP shell, over the half of the panel that lives under `/modcp`.
 *
 * A layout rather than a repeated header, so the gate runs once per navigation
 * and every section below it can assume access has already been resolved. It
 * still resolves it again in each page: a layout is not a security boundary in
 * the App Router — a page can be requested directly as an RSC payload — and
 * "the layout checked it" is precisely the assumption that turns into a hole.
 *
 * Not `/admin`-style separate authentication (F63's job). A moderator is
 * already logged in as themselves and their powers are the ones the board
 * grants them; a second password would protect nothing that the first one does
 * not already.
 *
 * The *other* half of the panel is under `/moderation` — the approval queue,
 * reports, and the warn screen — and `app/(board)/moderation/layout.tsx`
 * renders this same shell so the rail does not vanish the moment a moderator
 * starts working. See `ModCpShell` for why the URLs stay where they are.
 */
export default function ModCpLayout({ children }: { children: React.ReactNode }) {
  return <ModCpShell>{children}</ModCpShell>
}
