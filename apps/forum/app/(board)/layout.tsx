import { PageShell } from "@/components/shell/page-shell"
import { getActor } from "@/server/context"

/**
 * The board's chrome (F27): every reading page renders inside this.
 *
 * A route group rather than the root layout, so the ACP (F63) and the install
 * wizard (F83) can have their own chrome without unpicking this one — an admin
 * panel wearing the board's header is how a themed board ends up with an
 * unusable admin area.
 *
 * The breadcrumb is *not* rendered here. It belongs to the page, which is the
 * only thing that knows where it sits in the tree; a layout cannot read its
 * child's data, and threading it through a context would make every page that
 * forgot to set one silently inherit the last page's trail.
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  return <PageShell actor={await getActor()}>{children}</PageShell>
}
