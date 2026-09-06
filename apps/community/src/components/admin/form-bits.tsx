import { Alert, AlertDescription, controlVariants } from '@meith/ui'

export const INPUT = controlVariants()

export function Saved({ when = true, children }: { when?: boolean; children: React.ReactNode }) {
  if (!when) return null
  return (
    <Alert tone="success">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
