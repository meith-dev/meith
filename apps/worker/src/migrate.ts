import { loadEnvFiles } from '@meith/core/env-files'

import { migrate } from './migrate-role'

loadEnvFiles()

migrate(process.env.MIGRATIONS_DIR ?? '/app/migrations').then((code) => process.exit(code))
