import { Alert, AlertDescription } from '@meith/ui'

export const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function Saved({ when = true, children }: { when?: boolean; children: React.ReactNode }) {
  if (!when) return null
  return (
    <Alert tone="success">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
