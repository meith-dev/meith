import { logger } from '@meith/core'

import { checkReady, main } from './lifecycle'

const entrypoint = process.argv.includes('--ready') ? checkReady : main

entrypoint()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    logger({ module: 'worker' }).error({ err }, 'worker crashed')
    process.exit(1)
  })
