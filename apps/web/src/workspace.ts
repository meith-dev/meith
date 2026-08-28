import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function workspaceRoot(): string {
  let directory = resolve(process.cwd())

  for (;;) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) return directory
    const parent = dirname(directory)
    if (parent === directory) {
      throw new Error(
        'Could not find the workspace root above ' +
          `${process.cwd()}. The documentation is read from docs/ there; the site ` +
          'cannot be built from outside the repository.',
      )
    }
    directory = parent
  }
}

export const WORKSPACE_ROOT = workspaceRoot()

export const DOCS_DIRECTORY = join(WORKSPACE_ROOT, 'docs')

export const MARKETPLACE_FEED_FILE = join(WORKSPACE_ROOT, 'apps/web/public/marketplace/v1.json')
