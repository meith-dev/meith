import { definePlugin } from '@meith/plugin-kit'

import { handleAward, handleGrant, handleRules } from './handlers'
import en from './messages/en.json'
import { AWARDS_MIGRATIONS } from './schema'
import { deleteMember, mergeMember } from './store'
import { evaluateAwards, queueMember } from './tasks'
import { AwardsAdmin, GrantAdmin } from './ui/admin'
import {
  AwardPage,
  AwardsPage,
  Dashboard,
  MemberPage,
  PostbitBadges,
  ProfilePanel,
} from './ui/page'
import { RulesAdmin } from './ui/rules'

export const plugin = definePlugin({
  key: 'awards',
  name: en['awards.title'],
  nameKey: 'awards.title',
  version: '0.37.0',
  apiVersion: '0',
  description: en['awards.definition.description'],
  descriptionKey: 'awards.definition.description',
  migrations: AWARDS_MIGRATIONS,
  tasks: [{ id: 'evaluate', intervalSeconds: 300, run: evaluateAwards }],
  settings: [
    {
      key: 'postbit_limit',
      type: 'number',
      default: 5,
      label: en['awards.setting.limit'],
      labelKey: 'awards.setting.limit',
    },
    {
      key: 'notify_on_grant',
      type: 'boolean',
      default: true,
      label: en['awards.setting.notify'],
      labelKey: 'awards.setting.notify',
    },
    {
      key: 'show_reasons',
      type: 'boolean',
      default: true,
      label: en['awards.setting.reasons'],
      labelKey: 'awards.setting.reasons',
    },
  ],
  notifications: [
    {
      key: 'award_received',
      title: en['awards.notification.subject'],
      titleKey: 'awards.notification.subject',
      description: en['awards.notification.description'],
      descriptionKey: 'awards.notification.description',
      emailByDefault: false,
    },
  ],
  navigation: [
    { key: 'awards', label: 'Awards', labelKey: 'awards.title', path: '', audience: 'all' },
  ],
  pages: [
    {
      path: '',
      title: en['awards.title'],
      titleKey: 'awards.title',
      access: 'anonymous',
      render: AwardsPage,
    },
    {
      path: 'award',
      title: en['awards.award'],
      titleKey: 'awards.award',
      access: 'anonymous',
      render: AwardPage,
    },
    {
      path: 'member',
      title: en['awards.member.awards'],
      titleKey: 'awards.member.awards',
      access: 'anonymous',
      render: MemberPage,
    },
  ],
  adminPages: [
    { path: 'awards', title: en['awards.title'], titleKey: 'awards.title', render: AwardsAdmin },
    { path: 'grant', title: en['awards.grant'], titleKey: 'awards.grant', render: GrantAdmin },
    { path: 'rules', title: en['awards.rules'], titleKey: 'awards.rules', render: RulesAdmin },
  ],
  routes: [
    { path: 'rules', method: 'POST', access: 'admin', handler: handleRules },
    { path: 'awards', method: 'POST', access: 'admin', handler: handleAward },
    { path: 'grant', method: 'POST', access: 'admin', handler: handleGrant },
  ],
  hooks: {
    'post.created': async (post, _context, runtime) => queueMember(await runtime(), post.authorId),
    'thread.created': async (thread, _context, runtime) =>
      queueMember(await runtime(), thread.authorId),
    'reputation.changed': async (user, _context, runtime) =>
      queueMember(await runtime(), user.userId),
    'user.registered': async (user, _context, runtime) => queueMember(await runtime(), user.userId),
    'user.activated': async (user, _context, runtime) => queueMember(await runtime(), user.userId),
    'user.deleted': async (user, _context, runtime) =>
      deleteMember((await runtime()).data, user.userId),
    'user.merged': async (user, _context, runtime) =>
      mergeMember((await runtime()).data, user.keptUserId, user.mergedUserId),
  },
  contributions: [
    { region: 'postbit.badges', render: PostbitBadges },
    { region: 'profile.panel', render: ProfilePanel },
    { region: 'admin.dashboard', render: Dashboard },
  ],
})
