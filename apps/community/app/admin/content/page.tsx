import type { Metadata } from 'next'

import { cn, TextLink } from '@meith/ui'

import {
  DeletePrefixForm,
  DirectiveRowForm,
  NewDirectiveForm,
  NewPrefixForm,
  NewSmileyForm,
  NewWordFilterForm,
  SmileyRowForm,
  WordFilterRowForm,
} from '@/components/admin/content-forms'
import { PANEL_CARD } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { contentAdminRepository } from '@/server/content-admin'
import { getTranslator, tr } from '@/server/i18n'
import { contentAdminCopy } from '@/view/admin-content-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.content') }
}

export default async function AdminContentPage() {
  if ((await adminPageContext()) === null) return null

  const repository = contentAdminRepository()
  if (repository === null) {
    return (
      <PanelPage title={await tr('page.content')}>
        <p className="mt-2 text-sm text-muted-foreground">
          {await tr('page.this-board-running-in-memory-sample-3')}
        </p>
      </PanelPage>
    )
  }

  const [filters, prefixes, smilies, directives] = await Promise.all([
    repository.listWordFilters(),
    repository.listPrefixes(),
    repository.listSmilies(),
    repository.listDirectives(),
  ])

  const copy = contentAdminCopy(await getTranslator())
  const t = await getTranslator()

  return (
    <PanelPage title={await tr('page.content')} lede={t.t('contentPage.lede')} gap="loose">
      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.word-filters')}</h2>
        <p className="text-sm text-muted-foreground">{t.t('contentPage.wordFiltersHelp')}</p>
        <p className="text-xs text-muted-foreground">{t.t('contentPage.wordFiltersWholeWords')}</p>

        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {await tr('page.no-filters-posts-show-as')}
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {filters.map((filter) => (
              <WordFilterRowForm key={filter.id} filter={filter} copy={copy} />
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <NewWordFilterForm copy={copy} />
        </div>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.thread-prefixes')}</h2>
        <p className="text-sm text-muted-foreground">{t.t('contentPage.prefixHelp')}</p>

        {prefixes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {await tr('page.none-configured-so-composer-offers')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {prefixes.map((prefix) => (
              <li key={prefix.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{prefix.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t.t('contentPage.prefixMeta', {
                      order: prefix.displayOrder,
                      token: prefix.token ?? 'none',
                      path: prefix.forumPathPrefix ?? 'none',
                    })}
                  </span>
                </span>
                <DeletePrefixForm prefix={prefix} copy={copy} />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border pt-3">
          <NewPrefixForm copy={copy} />
        </div>
      </section>

      <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
        <h2 className="font-heading text-lg font-semibold">{t.t('contentPage.announcements')}</h2>
        <p className="text-muted-foreground">{t.t('contentPage.announcementsHelp')}</p>
        <TextLink href="/admin/content/announcements">{await tr('page.announcements-b')}</TextLink>
      </section>

      <section className={cn(PANEL_CARD, 'gap-2 text-sm')}>
        <h2 className="font-heading text-lg font-semibold">{t.t('contentPage.attachments')}</h2>
        <p className="text-muted-foreground">{t.t('contentPage.attachmentsHelp')}</p>
        <TextLink href="/admin/content/attachments">{await tr('page.attachments-b')}</TextLink>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{t.t('contentPage.smilies')}</h2>
        <p className="text-sm text-muted-foreground">{t.t('contentPage.smiliesHelp')}</p>
        <p className="text-xs text-muted-foreground">{t.t('contentPage.smiliesRendering')}</p>

        {smilies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.t('contentPage.noSmilies')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {smilies.map((smiley) => (
              <SmileyRowForm key={smiley.id} smiley={smiley} copy={copy} />
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <NewSmileyForm copy={copy} />
        </div>
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">{await tr('page.custom-directives')}</h2>
        <p className="text-sm text-muted-foreground">{t.t('contentPage.directivesHelp')}</p>
        <p className="text-xs text-muted-foreground">{t.t('contentPage.directivesSyntax')}</p>

        {directives.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.t('contentPage.noDirectives')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {directives.map((directive) => (
              <DirectiveRowForm key={directive.id} directive={directive} copy={copy} />
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <NewDirectiveForm copy={copy} />
        </div>
      </section>
    </PanelPage>
  )
}
