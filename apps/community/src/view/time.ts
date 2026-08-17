import {
  DEFAULT_TIME_ZONE,
  EN_CATALOG,
  formatDay,
  formatTimestamp,
  sourceTranslator,
  type Translator,
} from '@meith/i18n'
import type { TimeModel } from '@meith/theme-kit'

export const DEFAULT_TIMEZONE = DEFAULT_TIME_ZONE

export function untranslated(timeZone: string = DEFAULT_TIMEZONE): Translator {
  return sourceTranslator(EN_CATALOG, timeZone)
}

export function formatTime(
  at: Date,
  now: Date,
  translator: Translator = untranslated(),
): TimeModel {
  return formatTimestamp(at, now, translator)
}

export function formatDate(at: Date, translator: Translator = untranslated()): TimeModel {
  return formatDay(at, translator)
}

export function timezoneLabel(timeZone: string): string {
  return timeZone.replace(/_/g, ' ')
}
