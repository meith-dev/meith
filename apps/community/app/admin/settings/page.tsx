import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { buttonVariants, Card, CardContent, CardFooter, cn, Input } from '@meith/ui'

import { MailTestCard } from '@/components/admin/mail-test-card'
import { AdminSettingsForm } from '@/components/admin/settings-form'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { boardUrlResolution } from '@/server/board-url'
import { getTranslator } from '@/server/i18n'
import { assessMailReadiness } from '@/server/mail-health'
import { getSettings } from '@/server/settings'
import { buildAdminSettingsModel, DEFAULT_SETTING_GROUP, settingsHref } from '@/view/admin-settings'

export const metadata: Metadata = { title: 'Board settings' }

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; advanced?: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const query = await searchParams

  if (query.group === undefined && query.q === undefined) {
    redirect(settingsHref({ group: DEFAULT_SETTING_GROUP, advanced: query.advanced === '1' }))
  }
  const model = buildAdminSettingsModel({
    snapshot: await getSettings(),
    query: query.q,
    group: query.group,
    advanced: query.advanced === '1',
    t: await getTranslator(),
  })

  const mail =
    model.activeGroup === 'registration' || model.activeGroup === 'mail'
      ? await assessMailReadiness()
      : null

  const address = model.activeGroup === 'board' ? await boardUrlResolution() : null

  return (
    <PanelPage
      title="Board settings"
      lede={
        <>
          Every setting this build has, with what it does. A value equal to its default is not
          stored, so changing a default in a later release reaches a board that never touched it.
        </>
      }
    >
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <form method="get" className="flex min-w-64 flex-1 items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">Search settings</span>
              <Input
                type="search"
                name="q"
                defaultValue={model.query}
                placeholder="Search every group by name or description"
              />
            </label>
            {model.showAdvanced && <input type="hidden" name="advanced" value="1" />}
            <button type="submit" className={buttonVariants({ variant: 'outline' })}>
              Search
            </button>
          </form>

          {(model.showAdvanced || model.hiddenAdvanced > 0) && (
            <a
              href={settingsHref({
                group: model.activeGroup,
                query: model.query,
                advanced: !model.showAdvanced,
              })}
              className={cn(
                buttonVariants({ variant: model.showAdvanced ? 'secondary' : 'outline' }),
                'shrink-0',
              )}
            >
              {model.showAdvanced ? 'Hide advanced' : `Show ${model.hiddenAdvanced} advanced`}
            </a>
          )}
        </CardContent>

        <CardFooter>
          {model.query === ''
            ? `${model.total} setting${model.total === 1 ? '' : 's'} in ${
                model.groups[0]?.label ?? 'this group'
              }.`
            : `${model.total} match${model.total === 1 ? '' : 'es'} for “${model.query}”, across every group.`}
          {model.showAdvanced && ' Advanced settings are shown.'}
        </CardFooter>
      </Card>

      {address?.source === 'environment' && (
        <section className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p>
            The board’s address is <code>{address.url}</code>, from <code>APP_URL</code> in this
            deployment’s environment. It overrides the “Board address” field below, which is stored
            but not read until <code>APP_URL</code> is unset and the board redeployed.
          </p>
        </section>
      )}

      {address?.source === 'none' && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            This board does not know its own address
          </h2>
          <p className="text-sm">
            Every link the board sends is built from it, so password resets and confirmations arrive
            carrying no link at all — they are polite and useless. Feeds and canonical URLs fall
            back to a localhost address. Set “Board address” below.
          </p>
        </section>
      )}

      {model.activeGroup === 'mail' && mail !== null && (
        <MailTestCard
          summary={mail.summary}
          sends={mail.sends}
          fromEnvironment={mail.source === 'environment'}
        />
      )}

      {mail?.unactivatable && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            Nobody can finish registering
          </h2>
          <p className="text-sm">
            The activation method is{' '}
            <strong className="font-medium">{mail.activationMethod}</strong>, so a new account waits
            for a confirmation link — but this board sends no mail: {mail.summary.toLowerCase()}.
            Every account created while this is true is stuck: it cannot sign in, and the link that
            would release it never arrives.
          </p>
          <p className="text-sm">
            Either set the activation method to <strong className="font-medium">none</strong> or{' '}
            <strong className="font-medium">admin</strong>, or{' '}
            {mail.source === 'environment' ? (
              <>
                complete the <code>MAIL_*</code> variables in this deployment’s environment and
                redeploy — <code>MAIL_DRIVER</code> is set, so it overrides the mail settings
                screen.
              </>
            ) : (
              <>
                <a href={settingsHref({ group: 'mail' })} className="underline">
                  configure mail
                </a>
                , which takes effect without a redeploy and has a button to prove it works.
              </>
            )}
          </p>
        </section>
      )}

      <AdminSettingsForm groups={model.groups} />
    </PanelPage>
  )
}
