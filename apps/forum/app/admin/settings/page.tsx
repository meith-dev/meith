import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Card, CardContent, CardFooter, Input, buttonVariants, cn } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { AdminSettingsForm } from '@/components/admin/settings-form'
import { requireAdmin } from '@/server/admin'
import { assessMailReadiness } from '@/server/mail-health'
import { getSettings } from '@/server/settings'
import {
  DEFAULT_SETTING_GROUP,
  buildAdminSettingsModel,
  settingsHref,
} from '@/view/admin-settings'

export const metadata: Metadata = { title: 'Board settings' }

/**
 * F64 — board settings.
 *
 * Generated entirely from F08's registry: this file names no setting, and the
 * navigation, the search and every control come from `SETTING_DEFINITIONS`.
 *
 * The filters are **links, not a scripted filter**. A group tab and the search
 * box are GET forms, so the state is in the URL — which means an operator can
 * bookmark "the posting settings", send somebody a link to the one they are
 * arguing about, and use the back button. A client-side filter would have none
 * of that and would need JavaScript for a screen that otherwise does not.
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; advanced?: string }>
}) {
  /* Re-run, because a layout is not a security boundary (see the ACP layout). */
  await requireAdmin()

  const query = await searchParams

  /*
   * A bare `/admin/settings` names the group it is about to show.
   *
   * The screen has always defaulted to the first group; the URL simply did not
   * say so, which was invisible until the groups moved into the rail — an
   * address with no `group=` lit nothing, so an operator arriving at Board
   * settings saw the board's fields with no indication of which of the ten
   * groups that was. Stating the default costs one redirect on the way in and
   * makes every settings address bookmarkable as what it actually shows.
   */
  if (query.group === undefined && query.q === undefined) {
    redirect(
      settingsHref({ group: DEFAULT_SETTING_GROUP, advanced: query.advanced === '1' }),
    )
  }
  const model = buildAdminSettingsModel({
    snapshot: await getSettings(),
    query: query.q,
    group: query.group,
    advanced: query.advanced === '1',
  })

  /*
   * The one setting on this screen that can be turned into an unusable board.
   * Checked only while the registration group is on screen, which is where the
   * dropdown that causes it lives — the same warning on the theme tab would be
   * noise, and F70's health view is where it is stated unconditionally.
   */
  const mail = model.activeGroup === 'registration' ? await assessMailReadiness() : null

  return (
    <PanelPage
      title="Board settings"
      lede={
        <>
          Every setting this build has, with what it does. A value equal to its default is
          not stored, so changing a default in a later release reaches a board that never
          touched it.
        </>
      }
    >
      {/*
        The two filters, together, in a bar that looks like one.

        They used to be a search form, then a row of group chips, then a line of
        muted prose carrying the advanced toggle as an underlined word. Only one
        of those three is navigation — the groups, which are in the rail now —
        and the other two are filters over the list below. Putting them in one
        bounded row says that: this is what is narrowing what you are about to
        read, and here is how to widen it.
      */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          {/* A GET form: the search term lands in the URL and is shareable. */}
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

          {/*
            A link rather than a checkbox, because the state is in the URL and
            has to survive with scripting off — a checkbox would need a submit
            of its own, and a second submit button in a filter bar is a thing
            operators press expecting it to save the form below.

            It carries its own count so the offer is concrete: "Show 2 advanced"
            rather than a standing invitation to a screen that may have none.
          */}
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
              {model.showAdvanced
                ? 'Hide advanced'
                : `Show ${model.hiddenAdvanced} advanced`}
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

      {mail?.unactivatable && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-serif text-lg font-semibold text-destructive">
            Nobody can finish registering
          </h2>
          <p className="text-sm">
            The activation method is{' '}
            <strong className="font-medium">{mail.activationMethod}</strong>, so a new
            account waits for a confirmation link — but <code>MAIL_DRIVER</code> is{' '}
            <code>log</code>, which writes messages to the server log and sends nothing.
            Every account created while this is true is stuck: it cannot sign in, and the
            link that would release it never arrives.
          </p>
          <p className="text-sm">
            Either set the activation method to{' '}
            <strong className="font-medium">none</strong> or{' '}
            <strong className="font-medium">admin</strong>, or configure a mail driver.
            The driver is an environment variable and takes a restart; see the Mail
            section of the operator handbook.
          </p>
        </section>
      )}

      <AdminSettingsForm groups={model.groups} />
    </PanelPage>
  )
}
