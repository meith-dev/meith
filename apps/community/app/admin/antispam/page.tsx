import type { Metadata } from 'next'

import { cn, TextLink } from '@meith/ui'

import { CaptchaQuestionRowForm, NewCaptchaQuestionForm } from '@/components/admin/content-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { captchaQuestionRepository } from '@/server/antispam'
import { getTranslator, tr } from '@/server/i18n'
import { getSettings } from '@/server/settings'
import { contentAdminCopy } from '@/view/admin-content-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.anti-spam') }
}

export default async function AdminAntispamPage() {
  if ((await adminPageContext()) === null) return null

  const repository = captchaQuestionRepository()
  const settings = await getSettings()

  const mode = settings.get('antispam.captcha_mode')
  const questions = repository === null ? [] : await repository.list()
  const usable = questions.filter((question) => question.enabled && question.answers.length > 0)

  const translator = await getTranslator()
  const copy = contentAdminCopy(translator)

  return (
    <PanelPage
      title={await tr('page.anti-spam')}
      lede={
        <>
          The thresholds are in{' '}
          <TextLink href="/admin/settings?group=antispam">
            {await tr('page.settings-anti-spam')}
          </TextLink>
          {translator.t('adminAntispam.ledeEnd')}
        </>
      }
      gap="loose"
    >
      {mode === 'question' && usable.length === 0 && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <strong>{await tr('page.challenge-switched-there-nothing-ask')}</strong>{' '}
          {translator.t('adminAntispam.emptyChallenge')}
        </p>
      )}

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {await tr('page.registration-questions')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {translator.t('adminAntispam.questionsBefore')}{' '}
          <strong>{await tr('page.ask-question')}</strong>
          {translator.t('adminAntispam.questionsAfter')}
        </p>
        <p className="text-xs text-muted-foreground">
          {translator.t('adminAntispam.answersBefore')}{' '}
          <strong>{translator.t('adminAntispam.notSecret')}</strong>
          {translator.t('adminAntispam.answersAfter')}
        </p>

        {repository === null ? (
          <p className="text-sm text-muted-foreground">
            {await tr('page.this-board-running-in-memory-sample-9')}
          </p>
        ) : (
          <>
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {await tr('page.none-yet-challenge-asks-nothing')}
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {questions.map((question) => (
                  <CaptchaQuestionRowForm key={question.id} question={question} copy={copy} />
                ))}
              </div>
            )}

            <div className="border-t border-border pt-3">
              <NewCaptchaQuestionForm copy={copy} />
            </div>
          </>
        )}
      </section>

      <section className={cn(PANEL_CARD, 'text-sm')}>
        <h2 className="font-heading text-lg font-semibold">
          {await tr('page.what-each-control-worth')}
        </h2>
        <dl className="flex flex-col gap-3 text-muted-foreground">
          <div>
            <dt className="font-medium text-foreground">{await tr('page.hidden-field-trap')}</dt>
            <dd>{translator.t('adminAntispam.hiddenFieldHint')}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">{await tr('page.minimum-fill-time')}</dt>
            <dd>{translator.t('adminAntispam.minimumTimeHint')}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">{await tr('page.question')}</dt>
            <dd>{translator.t('adminAntispam.questionHint')}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">
              {translator.t('adminAntispam.firstPosts')}
            </dt>
            <dd>
              {translator.t('adminAntispam.firstPostsBefore')}{' '}
              <TextLink href="/modcp">{translator.t('adminAntispam.moderationQueue')}</TextLink>
              {translator.t('adminAntispam.firstPostsAfter')}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">{await tr('page.hourly-limits')}</dt>
            <dd>
              {translator.t('adminAntispam.hourlyBefore')}{' '}
              <em>{translator.t('adminAntispam.different')}</em>
              {translator.t('adminAntispam.hourlyBetween')}{' '}
              <strong>{translator.t('adminAntispam.bypassFlood')}</strong>
              {translator.t('adminAntispam.hourlyAfter')}
            </dd>
          </div>
        </dl>
      </section>

      <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
        <h2 className="font-heading text-lg font-semibold">
          {await tr('page.using-hosted-captcha')}
        </h2>
        <p className="text-muted-foreground">{translator.t('adminAntispam.hostedHint')}</p>
        <p className="text-muted-foreground">
          {translator.t('adminAntispam.providerBefore')}{' '}
          <code className="text-xs">CaptchaProvider</code>
          {translator.t('adminAntispam.providerBetween')}{' '}
          <code className="text-xs">packages/antispam</code>
          {translator.t('adminAntispam.providerEnd')}
        </p>
      </section>
    </PanelPage>
  )
}
