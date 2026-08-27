import type { Metadata } from 'next'

import { BAN_FILTER_TYPES } from '@meith/accounts'

import { NewBanFilterForm, RemoveBanFilterForm } from '@/components/admin/ban-filter-forms'
import { PANEL_CARD, PANEL_NOTE } from '@/components/shell/panel-list'
import { PanelPage } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { banFilterAuthors, boardBanFilters } from '@/server/ban-filter-admin'
import { getTranslator, tr } from '@/server/i18n'
import { BAN_FILTER_TYPE_KEY, banFilterAdminCopy } from '@/view/admin-ban-filter-copy'
import { formatDate } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.ban-filters') }
}

export default async function AdminBanFiltersPage() {
  if ((await adminPageContext()) === null) return null

  const filters = await boardBanFilters().listForAdmin()
  const authors = await banFilterAuthors(filters)
  const translator = await getTranslator()
  const copy = banFilterAdminCopy(translator)

  const types = BAN_FILTER_TYPES.map((type) => ({
    value: type,
    label: translator.t(BAN_FILTER_TYPE_KEY[type]),
  }))

  return (
    <PanelPage
      back={{ href: '/admin/users', label: translator.t('adminUsers.allMembers') }}
      title={await tr('page.ban-filters')}
      lede={translator.t('adminBanFilters.lede')}
      gap="loose"
    >
      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminBanFilters.held')}
        </h2>

        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translator.t('adminBanFilters.none')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {filters.map((filter) => (
              <div
                key={filter.id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {translator.t(BAN_FILTER_TYPE_KEY[filter.type])}
                    </span>{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      {filter.pattern}
                    </code>
                  </p>
                  {filter.note === null ? null : (
                    <p className="text-xs text-muted-foreground">{filter.note}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {filter.createdByUserId === null ||
                    authors.get(filter.createdByUserId) === undefined
                      ? translator.t('adminBanFilters.addedOn', {
                          date: formatDate(filter.createdAt, translator).label,
                        })
                      : translator.t('adminBanFilters.addedBy', {
                          author: authors.get(filter.createdByUserId) ?? '',
                          date: formatDate(filter.createdAt, translator).label,
                        })}
                  </p>
                </div>

                <RemoveBanFilterForm id={filter.id} pattern={filter.pattern} copy={copy} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={PANEL_CARD}>
        <h2 className="font-heading text-lg font-semibold">
          {translator.t('adminBanFilters.add')}
        </h2>
        <NewBanFilterForm types={types} copy={copy} />
      </section>

      <p className={PANEL_NOTE}>{translator.t('adminBanFilters.globNote')}</p>
    </PanelPage>
  )
}
