import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ComposeForm } from '@/components/messages/message-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { messageService } from '@/server/messages'

export const metadata: Metadata = { title: 'Write a message' }

/**
 * F60 — the composer, and the reply and forward buttons.
 *
 * Reply and forward are **GET links that prefill this form on the server**, not
 * separate routes and not a client-side template. That is what makes them work
 * with scripting off, and it is why the prefill can quote the original: the
 * server holds the copy check, so a `?reply=` naming a message this member does
 * not hold prefills nothing rather than leaking a subject line.
 */
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; reply?: string; forward?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { authorizer } = getContainer()
  const service = messageService()

  if (actor.userId === null || service === null) notFound()
  if (!authorizer.can(actor, 'pm.use')) notFound()

  const reply = positiveInt(query.reply)
  const forward = positiveInt(query.forward)

  /*
   * A draft that cannot be built — the id is somebody else's message, or is
   * nothing at all — falls back to an empty composer rather than a 404. The
   * member asked to write a message and should get to; failing the screen
   * would also confirm which ids exist.
   */
  const draft =
    reply !== null
      ? await service.replyDraft({ messageId: reply, userId: actor.userId }).catch(() => null)
      : forward !== null
        ? await service.forwardDraft({ messageId: forward, userId: actor.userId }).catch(() => null)
        : null

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold">Write a message</h1>
          <p className="text-sm text-muted-foreground">
            Private messages are not moderated, but the person you write to can
            report one.
          </p>
        </div>

        <ComposeForm
          /* `?to=` prefills from a profile's "send a message" link. It is only
             a default: the server resolves whatever is actually submitted. */
          to={draft?.to ?? query.to ?? ''}
          subject={draft?.subject ?? ''}
          message={draft?.message ?? ''}
          replyToId={draft?.replyToId ?? null}
        />

        <a href="/messages" className="text-sm text-primary hover:underline">
          ← Back to your messages
        </a>
      </div>
    </main>
  )
}

function positiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}
