import { definePlugin, type PluginDefinition, type PluginRequest, type PluginResponse, type PluginRuntimeContext } from '@meith/plugin-kit'

import { parseDuesConfig, type DuesConfigInput } from './config'
import {
  buildServices,
  entitlementDeps,
  handleCancel,
  handleCheckout,
  handlePortal,
  handleWebhook,
  type DuesServices,
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
import { DUES_MIGRATIONS } from './schema'
import { runReconcile, runSweep } from './tasks'
import { CodesPage, LedgerPage, MembersPage, PlansAdminPage, StatusPage } from './ui/admin'
import { GoPage, ManagePage, PlansPage, ReturnPage } from './ui/pages'

export function dues(input: DuesConfigInput): PluginDefinition {
  const config = parseDuesConfig(input)

  const route =
    (
      fn: (services: DuesServices, request: PluginRequest) => Promise<PluginResponse>,
    ): ((request: PluginRequest, context: PluginRuntimeContext) => Promise<PluginResponse>) =>
    (request, context) =>
      fn(buildServices(config, context), request)

  return definePlugin({
    key: 'dues',
    name: 'Dues',
    version: '0.1.0',
    description:
      `Sells ${config.label.toLowerCase()} — time-limited membership of a group — ` +
      'through Stripe, for yourself or as a gift.',
    apiVersion: '0',

    settings: [
      {
        key: 'stripe_secret_key',
        label: 'Stripe secret key',
        type: 'secret',
        env: 'DUES_STRIPE_SECRET_KEY',
        required: true,
        default: '',
        description: 'The sk_live_… or sk_test_… key from the Stripe dashboard.',
      },
      {
        key: 'stripe_webhook_secret',
        label: 'Webhook signing secret',
        type: 'secret',
        env: 'DUES_STRIPE_WEBHOOK_SECRET',
        required: true,
        default: '',
        description:
          'The whsec_… secret of the webhook endpoint. Without it, payments are taken ' +
          'but can never confirm.',
      },
      {
        key: 'stripe_api_version',
        label: 'Stripe API version',
        default: '2024-12-18.acacia',
        advanced: true,
        description:
          'Pinned so Stripe’s payload shapes change on a deploy, not on a Tuesday. ' +
          'Change it only alongside a plugin upgrade that expects the new shapes.',
      },
      {
        key: 'stripe_api_base',
        label: 'Stripe API address',
        env: 'DUES_STRIPE_API_BASE',
        default: 'https://api.stripe.com',
        advanced: true,
        description: 'Only a stripe-mock or a test double ever changes this.',
      },
    ],

    migrations: DUES_MIGRATIONS,

    tasks: [
      {
        id: 'reconcile',
        intervalSeconds: 300,
        run: async (context) => {
          const services = buildServices(config, context)
          const result = await runReconcile(entitlementDeps(services), services.stripe)
          if (
            result.ordersSettled + result.ordersClosed + result.eventsReplayed + result.subscriptionsCorrected >
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
          const services = buildServices(config, context)
          const expired = await runSweep(entitlementDeps(services))
          if (expired > 0) context.logger.info('dues: memberships expired', { expired })
        },
      },
    ],

    notifications: [
      {
        key: 'gift_received',
        title: 'Somebody gifts you a membership',
        description: 'A member bought a membership in your name. It starts the moment the payment confirms.',
      },
      {
        key: 'renewal_trouble',
        title: 'A membership payment fails',
        description: 'A renewal did not go through. Access holds during the grace window while Stripe retries.',
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
        title: config.label,
        access: 'anonymous',
        render: (context) => PlansPage({ config, context }),
      },
      {
        path: 'return',
        title: 'Confirming your payment',
        access: 'member',
        render: (context) => ReturnPage({ config, context }),
      },
      {
        path: 'manage',
        title: `Your ${config.label.toLowerCase()}`,
        access: 'member',
        render: (context) => ManagePage({ config, context }),
      },
      {
        path: 'go',
        title: 'Over to Stripe',
        access: 'member',
        render: (context) =>
          GoPage({
            config,
            context,
            allowedHosts: [
              'checkout.stripe.com',
              'billing.stripe.com',
              ...config.extraRedirectHosts,
            ],
          }),
      },
    ],

    adminPages: [
      {
        path: 'status',
        title: 'Dues — status',
        render: (context) => StatusPage({ config, context }),
      },
      {
        path: 'plans',
        title: 'Dues — plans',
        render: (context) => PlansAdminPage({ config, context }),
      },
      {
        path: 'members',
        title: 'Dues — memberships',
        render: (context) => MembersPage({ context }),
      },
      {
        path: 'codes',
        title: 'Dues — discount codes',
        render: (context) => CodesPage({ config, context }),
      },
      {
        path: 'ledger',
        title: 'Dues — ledger',
        render: (context) => LedgerPage({ config, context }),
      },
    ],

    hooks: {
      'view.header': (value) => ({
        ...value,
        navigation: [...value.navigation, { label: config.label, href: '/plugins/dues' }],
      }),
    },

    allowedRedirectHosts: [
      'checkout.stripe.com',
      'billing.stripe.com',
      ...config.extraRedirectHosts,
    ],
  })
}
