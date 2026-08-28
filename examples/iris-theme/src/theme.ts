import { defaultTheme } from '@meith/theme-default'
import { defineTheme } from '@meith/theme-kit'

import { Footer } from './slots/footer'

export const irisTheme = defineTheme({
  key: 'iris',
  title: 'Iris',
  version: '0.1.0',
  extends: defaultTheme,
  slots: { Footer },
})
