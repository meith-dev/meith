import { defaultTheme } from '@meith/theme-default'
import { defineTheme } from '@meith/theme-kit'

import { Footer } from './slots/footer'

export const irisTheme = defineTheme({
  key: 'iris',
  title: 'Iris',
  extends: defaultTheme,
  slots: { Footer },
})
