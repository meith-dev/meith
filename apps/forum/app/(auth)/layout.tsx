import { PageShell } from "@/components/shell/page-shell"
import { getActor } from "@/server/context"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell actor={await getActor()}>
      <main
        id="board-content"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center px-6 py-12"
      >
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          {children}
        </div>
      </main>
    </PageShell>
  )
}
