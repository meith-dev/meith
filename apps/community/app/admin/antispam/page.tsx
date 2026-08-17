import type { Metadata } from 'next'

import { cn } from '@meith/ui'

import { CaptchaQuestionRowForm, NewCaptchaQuestionForm } from '@/components/admin/content-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { captchaQuestionRepository } from '@/server/antispam'
import { tr } from '@/server/i18n'
import { getSettings } from '@/server/settings'

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

  return (
    <PanelPage
      title={await tr('page.anti-spam')}
      lede={
        <>
          The thresholds are in{' '}
          <a
            href="/admin/settings?group=antispam"
            className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {await tr('page.settings-anti-spam')}
          </a>
          . This screen holds the questions, and what each control is actually worth.
        </>
      }
      gap="loose"
    >
      {mode === 'question' && usable.length === 0 && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <strong>{await tr('page.challenge-switched-there-nothing-ask')}</strong> Registration is
          currently open to everybody. Add a question below — until then this setting is doing
          nothing, which is deliberate: refusing every applicant because the list is empty would be
          worse.
        </p>
      )}

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {await tr('page.registration-questions')}
        </h2>
        <p className="text-sm text-muted-foreground">
          Asked on the registration form when the challenge is set to{' '}
          <strong>{await tr('page.ask-question')}</strong>. One is chosen at random per visitor.
          Pick something a regular here knows and a script does not — the name of a section, an
          in-joke, the board&rsquo;s own subject.
        </p>
        <p className="text-xs text-muted-foreground">
          Answers are stored as you type them and are <strong>not secret</strong>: the question is
          shown to everybody and anyone can learn the answer by registering once. This stops
          scripts, not people.
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
                  <CaptchaQuestionRowForm key={question.id} question={question} />
                ))}
              </div>
            )}

            <div className="border-t border-border pt-3">
              <NewCaptchaQuestionForm />
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
            <dd>
              Free, on by default, and catches the bots that fill every field in a form. A bot that
              reads your CSS defeats it. There is no reason to turn it off — a real visitor never
              sees it.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">{await tr('page.minimum-fill-time')}</dt>
            <dd>
              Catches instant submissions. Keep it at a few seconds: a password manager filling a
              form in two is a real person, and this is the control most likely to turn away
              somebody genuine.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">{await tr('page.question')}</dt>
            <dd>
              Stops scripted registration and does not stop somebody paid to answer it. It is also
              the only control here that costs every legitimate applicant a moment, so switch it on
              when you have a problem rather than in advance.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Hold a new member&rsquo;s first posts</dt>
            <dd>
              The most effective thing on this page. Spam accounts post once or twice and never
              return, so a threshold of two or three catches nearly all of it — at the cost of a
              real new member waiting for a moderator once. Held posts appear in{' '}
              <a
                href="/modcp"
                className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                the moderation queue
              </a>
              .
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">{await tr('page.hourly-limits')}</dt>
            <dd>
              A ceiling on how much anybody can do in an hour, counted in the database so every
              server shares one allowance. They are a<em> different</em> control from the posting
              flood interval, which sets a minimum gap between two actions: an interval does nothing
              about a script posting steadily all night, and a limit does nothing about a
              double-click. Members with <strong>bypass flood check</strong> are exempt from both.
            </dd>
          </div>
        </dl>
      </section>

      <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
        <h2 className="font-heading text-lg font-semibold">
          {await tr('page.using-hosted-captcha')}
        </h2>
        <p className="text-muted-foreground">
          Not offered here, and not because it would be hard. A hosted captcha means every
          visitor&rsquo;s browser contacting a third party before they can join, which is a decision
          about your members rather than a setting — so this board ships the seam and not the
          service.
        </p>
        <p className="text-muted-foreground">
          A provider is a small module implementing <code className="text-xs">CaptchaProvider</code>
          : issue a challenge, verify an answer. No form and no call site changes. See{' '}
          <code className="text-xs">packages/antispam</code>, or ship it as a plugin.
        </p>
      </section>
    </PanelPage>
  )
}
