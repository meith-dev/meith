import { definePlugin } from '@meith/plugin-kit'

import {
  handleAddOrganiser,
  handleCreateEvent,
  handleDeleteEvent,
  handleEventIcs,
  handleRemoveOrganiser,
  handleRsvp,
  handleUpdateEvent,
} from './handlers'
import en from './messages/en.json'
import { sendReminders } from './reminders'
import { CALENDAR_MIGRATIONS } from './schema'
import { OrganisersPage } from './ui/admin'
import { CalendarPage } from './ui/page'
import { ThreadEventCard } from './ui/thread-card'

export const ADD_RATE_LIMIT = { limit: 20, windowSeconds: 3600 }

export const calendarPlugin = definePlugin({
  key: 'calendar',
  name: en['calendar.definition.name'],
  nameKey: 'calendar.definition.name',
  version: '0.36.2',
  description: en['calendar.definition.description'],
  descriptionKey: 'calendar.definition.description',
  apiVersion: '0',

  settings: [
    {
      key: 'reminder_hours',
      label: en['calendar.setting.reminders.label'],
      labelKey: 'calendar.setting.reminders.label',
      description: en['calendar.setting.reminders.description'],
      descriptionKey: 'calendar.setting.reminders.description',
      type: 'number',
      default: 2,
    },
    {
      key: 'any_member_may_add',
      label: en['calendar.setting.anyMember.label'],
      labelKey: 'calendar.setting.anyMember.label',
      description: en['calendar.setting.anyMember.description'],
      descriptionKey: 'calendar.setting.anyMember.description',
      type: 'boolean',
      default: false,
    },
  ],

  migrations: CALENDAR_MIGRATIONS,

  tasks: [{ id: 'reminders', schedule: '*/5 * * * *', run: sendReminders }],

  notifications: [
    {
      key: 'reminder',
      title: en['calendar.reminder.title'],
      titleKey: 'calendar.reminder.title',
      description: en['calendar.reminder.description'],
      descriptionKey: 'calendar.reminder.description',
      emailByDefault: false,
    },
  ],

  pages: [
    {
      path: '',
      title: en['calendar.page.title'],
      titleKey: 'calendar.page.title',
      access: 'anonymous',
      render: CalendarPage,
    },
  ],

  navigation: [
    {
      key: 'calendar',
      label: en['calendar.nav.label'],
      labelKey: 'calendar.nav.label',
      path: '',
      audience: 'all',
    },
  ],

  adminPages: [
    {
      path: 'organisers',
      title: en['calendar.admin.organisers.title'],
      titleKey: 'calendar.admin.organisers.title',
      render: OrganisersPage,
    },
  ],

  routes: [
    {
      path: 'events/rsvp',
      method: 'POST',
      access: 'member',
      rateLimit: ADD_RATE_LIMIT,
      handler: handleRsvp,
    },
    {
      path: 'events',
      method: 'POST',
      access: 'member',
      rateLimit: ADD_RATE_LIMIT,
      handler: handleCreateEvent,
    },
    {
      path: 'events/update',
      method: 'POST',
      access: 'member',
      rateLimit: ADD_RATE_LIMIT,
      handler: handleUpdateEvent,
    },
    {
      path: 'events/delete',
      method: 'POST',
      access: 'member',
      rateLimit: ADD_RATE_LIMIT,
      handler: handleDeleteEvent,
    },
    {
      path: 'events/ics',
      method: 'GET',
      access: 'anonymous',
      handler: handleEventIcs,
    },
    {
      path: 'organisers/add',
      method: 'POST',
      access: 'admin',
      handler: handleAddOrganiser,
    },
    {
      path: 'organisers/remove',
      method: 'POST',
      access: 'admin',
      handler: handleRemoveOrganiser,
    },
  ],

  contributions: [{ region: 'thread.header', render: ThreadEventCard }],
})
