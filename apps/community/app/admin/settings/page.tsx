import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { buttonVariants, Card, CardContent, CardFooter, cn, Input } from '@meith/ui'

import { FaviconUploadForm } from '@/components/admin/branding-forms'
import { MailTestCard } from '@/components/admin/mail-test-card'
import { AdminSettingsForm } from '@/components/admin/settings-form'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { destinationIsFromEnvironment } from '@/server/backup-admin'
import { boardUrlResolution } from '@/server/board-url'
import { faviconKey, faviconSrc } from '@/server/branding'
import { getTranslator, tr } from '@/server/i18n'
import { MAX_IMAGE_BYTES } from '@/server/image-upload'
import { assessMailReadiness } from '@/server/mail-health'
import { pushReadiness } from '@/server/push'
import { getSettings } from '@/server/settings'
import { faviconFormsCopy, mailTestCardCopy, settingsFormCopy } from '@/view/admin-panel-copy'
import { buildAdminSettingsModel, DEFAULT_SETTING_GROUP, settingsHref } from '@/view/admin-settings'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.board-settings') }
}

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
  const [t, snapshot] = await Promise.all([getTranslator(), getSettings()])
  const model = buildAdminSettingsModel({
    snapshot,
    query: query.q,
    group: query.group,
    advanced: query.advanced === '1',
    t,
  })

  const mail =
    model.activeGroup === 'registration' || model.activeGroup === 'mail'
      ? await assessMailReadiness()
      : null

  const address = model.activeGroup === 'board' ? await boardUrlResolution() : null

  const push = model.activeGroup === 'push' ? await pushReadiness() : null

  const favicon = model.activeGroup === 'board' ? await faviconKey() : null

  const backupFromEnvironment = model.activeGroup === 'backup' && destinationIsFromEnvironment()

  return (
    <PanelPage title={await tr('page.board-settings')} lede={t.t('adminSettings.lede')}>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <form method="get" className="flex min-w-64 flex-1 items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">{await tr('page.search-settings')}</span>
              <Input
                type="search"
                name="q"
                defaultValue={model.query}
                placeholder={t.t('adminSettings.searchPlaceholder')}
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
              {model.showAdvanced
                ? t.t('adminSettings.hideAdvanced')
                : t.t('adminSettings.showAdvanced', { count: model.hiddenAdvanced })}
            </a>
          )}
        </CardContent>

        <CardFooter>
          {model.query === ''
            ? t.t('adminSettings.settingCount', {
                count: model.total,
                group: model.groups[0]?.label ?? t.t('adminSettings.thisGroup'),
              })
            : t.t('adminSettings.matchCount', { count: model.total, query: model.query })}
          {model.showAdvanced && t.t('adminSettings.advancedShown')}
        </CardFooter>
      </Card>

      {address?.source === 'environment' && (
        <section className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p>
            {t.t('adminSettings.environmentAddressBefore')} <code>{address.url}</code>
            {t.t('adminSettings.environmentAddressAfterUrl')} <code>APP_URL</code>
            {t.t('adminSettings.environmentAddressEnd')}
          </p>
        </section>
      )}

      {address?.source === 'none' && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            {await tr('page.this-board-does-not-know')}
          </h2>
          <p className="text-sm">{t.t('adminSettings.noAddress')}</p>
        </section>
      )}

      {model.activeGroup === 'mail' && mail !== null && (
        <MailTestCard
          summary={mail.summary}
          sends={mail.sends}
          fromEnvironment={mail.source === 'environment'}
          copy={mailTestCardCopy(t)}
        />
      )}

      {mail?.unactivatable && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            {await tr('page.nobody-can-finish-registering')}
          </h2>
          <p className="text-sm">
            The activation method is{' '}
            <strong className="font-medium">{mail.activationMethod}</strong>, so a new account waits
            for a confirmation link — but this board sends no mail: {mail.summary.toLowerCase()}.
            Every account created while this is true is stuck: it cannot sign in, and the link that
            would release it never arrives.
          </p>
          <p className="text-sm">
            {t.t('adminSettings.fixActivationBefore')} <strong className="font-medium">none</strong>{' '}
            {t.t('adminSettings.fixActivationBetween')}{' '}
            <strong className="font-medium">admin</strong>
            {t.t('adminSettings.fixActivationAfter')}
            {mail.source === 'environment' ? (
              <>
                {t.t('adminSettings.environmentMailBefore')} <code>MAIL_*</code>
                {t.t('adminSettings.environmentMailBetween')} <code>MAIL_DRIVER</code>
                {t.t('adminSettings.environmentMailEnd')}
              </>
            ) : (
              <>
                <a href={settingsHref({ group: 'mail' })} className="underline">
                  {t.t('adminSettings.configureMail')}
                </a>
                {t.t('adminSettings.configureMailEnd')}
              </>
            )}
          </p>
        </section>
      )}

      {push !== null && push.problem !== null && push.problem !== 'disabled' && (
        <section
          role="alert"
          className="flex flex-col gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
        >
          <h2 className="font-heading text-lg font-semibold text-destructive">
            {t.t('adminSettings.pushNotLive')}
          </h2>
          <p className="text-sm">
            {push.problem === 'no-subject'
              ? t.t('adminSettings.pushNoContact')
              : t.t('adminSettings.pushNoKeys')}
          </p>
        </section>
      )}

      {backupFromEnvironment && (
        <section className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p>{t.t('adminSettings.backupFromEnvironment')}</p>
        </section>
      )}

      {model.activeGroup === 'board' && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-semibold">
              {t.t('setting.board.favicon.label')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.t('setting.board.favicon.description')}
            </p>
          </div>
          <FaviconUploadForm
            src={favicon === null ? null : faviconSrc(favicon)}
            maxKib={MAX_IMAGE_BYTES / 1024}
            copy={faviconFormsCopy(t)}
          />
        </section>
      )}

      <AdminSettingsForm groups={model.groups} copy={settingsFormCopy(t)} />
    </PanelPage>
  )
}
