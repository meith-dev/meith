import {
  definePlugin,
  type PluginDefinition,
  type PluginRequest,
  type PluginResponse,
  type PluginRuntimeContext,
} from '@meith/plugin-kit'

import {
  DEFAULT_CURRENCY,
  DEFAULT_GRACE_DAYS,
  DUES_CURRENCY_OPTIONS,
  type DuesConfig,
  type DuesConfigInput,
  parseDuesConfig,
  resolveDuesConfig,
} from './config'
import {
  buildServices,
  type DuesServices,
  entitlementDeps,
  handleCancel,
  handleCheckout,
  handlePortal,
  handleWebhook,
} from './handlers'
import {
  handleAdminCancel,
  handleAdminClear,
  handleAdminCodeCreate,
  handleAdminCodeDisable,
  handleAdminExtend,
  handleAdminPlanArchive,
  handleAdminPlanCreate,
  handleAdminPlanUpdate,
  handleAdminRevoke,
} from './handlers-admin'
import en from './messages/en.json'
import { DUES_MIGRATIONS } from './schema'
import { runReconcile, runSweep } from './tasks'
import { CodesPage, LedgerPage, MembersPage, PlansAdminPage, StatusPage } from './ui/admin'
import { GoPage, ManagePage, PlansPage, ReturnPage } from './ui/pages'

export function createDues(input: DuesConfigInput = {}): PluginDefinition {
  const staticConfig = parseDuesConfig(input)

  const configFor = (context: PluginRuntimeContext): DuesConfig =>
    resolveDuesConfig(staticConfig, context.settings)

  const route =
    (
      fn: (services: DuesServices, request: PluginRequest) => Promise<PluginResponse>,
    ): ((request: PluginRequest, context: PluginRuntimeContext) => Promise<PluginResponse>) =>
    (request, context) =>
      fn(buildServices(configFor(context), context), request)

  return definePlugin({
    key: 'dues',
    name: 'Dues',
    version: '0.30.0',
    description: en['dues.definition.description'].replace(
      '{label}',
      staticConfig.label.toLowerCase(),
    ),
    descriptionKey: 'dues.definition.description',
    descriptionArgs: { label: staticConfig.label.toLowerCase() },
    apiVersion: '0',

    settings: [
      {
        key: 'currency',
        label: en['dues.definition.setting.currency.label'],
        labelKey: 'dues.definition.setting.currency.label',
        type: 'select',
        options: DUES_CURRENCY_OPTIONS,
        env: 'DUES_CURRENCY',
        default: DEFAULT_CURRENCY,
        description: en['dues.definition.setting.currency.description'],
        descriptionKey: 'dues.definition.setting.currency.description',
      },
      {
        key: 'grace_days',
        label: en['dues.definition.setting.graceDays.label'],
        labelKey: 'dues.definition.setting.graceDays.label',
        type: 'number',
        env: 'DUES_GRACE_DAYS',
        default: DEFAULT_GRACE_DAYS,
        description: en['dues.definition.setting.graceDays.description'],
        descriptionKey: 'dues.definition.setting.graceDays.description',
      },
      {
        key: 'stripe_secret_key',
        label: en['dues.definition.setting.secret.label'],
        labelKey: 'dues.definition.setting.secret.label',
        type: 'secret',
        env: 'DUES_STRIPE_SECRET_KEY',
        required: true,
        default: '',
        description: en['dues.definition.setting.secret.description'],
        descriptionKey: 'dues.definition.setting.secret.description',
      },
      {
        key: 'stripe_webhook_secret',
        label: en['dues.definition.setting.webhook.label'],
        labelKey: 'dues.definition.setting.webhook.label',
        type: 'secret',
        env: 'DUES_STRIPE_WEBHOOK_SECRET',
        required: true,
        default: '',
        description: en['dues.definition.setting.webhook.description'],
        descriptionKey: 'dues.definition.setting.webhook.description',
      },
      {
        key: 'stripe_api_version',
        label: en['dues.definition.setting.apiVersion.label'],
        labelKey: 'dues.definition.setting.apiVersion.label',
        default: '2024-12-18.acacia',
        advanced: true,
        description: en['dues.definition.setting.apiVersion.description'],
        descriptionKey: 'dues.definition.setting.apiVersion.description',
      },
      {
        key: 'stripe_api_base',
        label: en['dues.definition.setting.apiBase.label'],
        labelKey: 'dues.definition.setting.apiBase.label',
        env: 'DUES_STRIPE_API_BASE',
        default: 'https://api.stripe.com',
        advanced: true,
        description: en['dues.definition.setting.apiBase.description'],
        descriptionKey: 'dues.definition.setting.apiBase.description',
      },
    ],

    migrations: DUES_MIGRATIONS,

    tasks: [
      {
        id: 'reconcile',
        intervalSeconds: 300,
        run: async (context) => {
          const services = buildServices(configFor(context), context)
          const result = await runReconcile(entitlementDeps(services), services.stripe)
          if (
            result.ordersSettled +
              result.ordersClosed +
              result.eventsReplayed +
              result.subscriptionsCorrected >
            0
          ) {
            context.logger.info('dues: reconciled', { ...result })
          }
        },
      },
      {
        id: 'sweep',
        intervalSeconds: 3600,
        run: async (context) => {
          const services = buildServices(configFor(context), context)
          const expired = await runSweep(entitlementDeps(services))
          if (expired > 0) context.logger.info('dues: memberships expired', { expired })
        },
      },
    ],

    notifications: [
      {
        key: 'gift_received',
        title: en['dues.definition.notification.gift.title'],
        titleKey: 'dues.definition.notification.gift.title',
        description: en['dues.definition.notification.gift.description'],
        descriptionKey: 'dues.definition.notification.gift.description',
      },
      {
        key: 'renewal_trouble',
        title: en['dues.definition.notification.renewal.title'],
        titleKey: 'dues.definition.notification.renewal.title',
        description: en['dues.definition.notification.renewal.description'],
        descriptionKey: 'dues.definition.notification.renewal.description',
      },
    ],

    routes: [
      {
        path: 'checkout',
        method: 'POST',
        access: 'member',
        rateLimit: { limit: 10, windowSeconds: 60 },
        handler: route(handleCheckout),
      },
      {
        path: 'portal',
        method: 'POST',
        access: 'member',
        rateLimit: { limit: 10, windowSeconds: 60 },
        handler: route(handlePortal),
      },
      {
        path: 'cancel',
        method: 'POST',
        access: 'member',
        rateLimit: { limit: 10, windowSeconds: 60 },
        handler: route(handleCancel),
      },
      {
        path: 'hook/stripe',
        method: 'POST',
        access: 'anonymous',
        rawBody: true,
        maxBodyBytes: 262_144,
        handler: route(handleWebhook),
      },
      {
        path: 'codes/create',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminCodeCreate),
      },
      {
        path: 'codes/disable',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminCodeDisable),
      },
      {
        path: 'members/extend',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminExtend),
      },
      {
        path: 'members/cancel',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminCancel),
      },
      {
        path: 'members/revoke',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminRevoke),
      },
      {
        path: 'attention/clear',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminClear),
      },
      {
        path: 'plans/create',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminPlanCreate),
      },
      {
        path: 'plans/update',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminPlanUpdate),
      },
      {
        path: 'plans/archive',
        method: 'POST',
        access: 'admin',
        handler: route(handleAdminPlanArchive),
      },
    ],

    pages: [
      {
        path: '',
        title: staticConfig.label,
        access: 'anonymous',
        render: (context) => PlansPage({ config: configFor(context), context }),
      },
      {
        path: 'return',
        title: en['dues.definition.page.return'],
        titleKey: 'dues.definition.page.return',
        access: 'member',
        render: (context) => ReturnPage({ config: configFor(context), context }),
      },
      {
        path: 'manage',
        title: en['dues.definition.manage'].replace('{label}', staticConfig.label.toLowerCase()),
        titleKey: 'dues.definition.manage',
        titleArgs: { label: staticConfig.label.toLowerCase() },
        access: 'member',
        render: (context) => ManagePage({ config: configFor(context), context }),
      },
      {
        path: 'go',
        title: en['dues.definition.go'],
        titleKey: 'dues.definition.go',
        access: 'member',
        render: (context) =>
          GoPage({
            config: configFor(context),
            context,
            allowedHosts: [
              'checkout.stripe.com',
              'billing.stripe.com',
              ...staticConfig.extraRedirectHosts,
            ],
          }),
      },
    ],

    adminPages: [
      {
        path: 'status',
        title: en['dues.definition.page.status'],
        titleKey: 'dues.definition.page.status',
        render: (context) => StatusPage({ config: configFor(context), context }),
      },
      {
        path: 'plans',
        title: en['dues.definition.page.plans'],
        titleKey: 'dues.definition.page.plans',
        render: (context) => PlansAdminPage({ config: configFor(context), context }),
      },
      {
        path: 'members',
        title: en['dues.definition.page.members'],
        titleKey: 'dues.definition.page.members',
        render: (context) => MembersPage({ context }),
      },
      {
        path: 'codes',
        title: en['dues.definition.page.codes'],
        titleKey: 'dues.definition.page.codes',
        render: (context) => CodesPage({ config: configFor(context), context }),
      },
      {
        path: 'ledger',
        title: en['dues.definition.page.ledger'],
        titleKey: 'dues.definition.page.ledger',
        render: (context) => LedgerPage({ config: configFor(context), context }),
      },
    ],

    navigation: [
      { key: 'plans', label: staticConfig.label, path: '', audience: 'members' },
      {
        key: 'manage',
        label: en['dues.definition.manage'].replace('{label}', staticConfig.label.toLowerCase()),
        labelKey: 'dues.definition.manage',
        labelArgs: { label: staticConfig.label.toLowerCase() },
        path: 'manage',
        audience: 'members',
        under: 'plans',
      },
    ],

    allowedRedirectHosts: [
      'checkout.stripe.com',
      'billing.stripe.com',
      ...staticConfig.extraRedirectHosts,
    ],
  })
}

export const dues: PluginDefinition = createDues()
