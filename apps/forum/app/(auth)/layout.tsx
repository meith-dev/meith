import { PageShell } from "@/components/shell/page-shell"
import { getActor } from "@/server/context"

/**
 * Chrome shared by every auth screen (F25/F27).
 *
 * The board's header and footer come from `PageShell`, which resolves the
 * theme's slots — so these screens are part of the board rather than a separate
 * unstyled island, and installing a second theme restyles them too. The slot
 * composition lives in one place; see that file for why it is not repeated here.
 *
 * The centered card stays in this layout rather than becoming a slot: it is this
 * route group's shape, not a board-wide region a theme replaces.
 *
 * The real actor is resolved, not assumed. These screens exist for people who are
 * not signed in, but a signed-in visitor reaching /register should not be told
 * "Not signed in" — they should see their own panel, log-out included.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell actor={await getActor()}>
      <main
        id="board-content"
        className="flex flex-1 flex-col items-center justify-center px-6 py-12"
      >
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          {children}
        </div>
      </main>
    </PageShell>
  )
}
