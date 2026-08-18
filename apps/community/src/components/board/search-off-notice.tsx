import { Card, CardContent } from '@meith/ui'

export function SearchOffNotice({ title, message }: { title: string; message: string }) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 flex-1"
    >
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </main>
  )
}
