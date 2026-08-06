import { UserCpNav } from './usercp-nav'

export function UserCpShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      { }
      <aside className="px-6 pt-6 lg:sticky lg:top-6 lg:w-56 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0">
        <UserCpNav />
      </aside>

      { }
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
