import { createServer } from 'node:http'

import { MEITH_VERSION } from '@meith/marketplace'

import { E2E_FAKE_MARKETPLACE_PORT } from './config'
import { samplePng } from './png'

function oneMinorAhead(version: string): string {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return `${major}.${minor + 1}.0`
}

export const DUES_FIXTURE_VERSION = oneMinorAhead(MEITH_VERSION)

export const DEFAULT_THEME_FIXTURE_VERSION = oneMinorAhead(MEITH_VERSION)

const FEED = {
  schema: 'https://www.meith.dev/marketplace/v1.json#/schema',
  listings: [
    {
      key: 'dues',
      kind: 'plugin',
      package: '@meith/plugin-dues',
      name: 'Dues',
      description: 'Paid memberships through Stripe.',
      screenshots: ['/marketplace/screenshots/dues-light.png'],
      version: DUES_FIXTURE_VERSION,
      apiVersion: 0,
      meith: '>=0.16 <1',
      repository: 'https://github.com/meith-dev/meith',
      licence: 'MIT',
    },
    {
      key: 'default',
      kind: 'theme',
      package: '@meith/theme-default',
      name: 'Default',
      description: 'The default theme.',
      screenshots: ['/marketplace/screenshots/default-light.png'],
      version: DEFAULT_THEME_FIXTURE_VERSION,
      apiVersion: 0,
      meith: '>=0.16 <1',
      repository: 'https://github.com/meith-dev/meith',
      licence: 'MIT',
    },
    {
      key: 'greeter',
      kind: 'plugin',
      package: '@meith/plugin-greeter',
      name: 'Greeter',
      description: 'Says hello. The worked example from the plugin API docs.',
      screenshots: ['/marketplace/screenshots/greeter-light.png'],
      version: '1.0.0',
      apiVersion: 0,
      meith: '>=0.16 <1',
      repository: 'https://github.com/meith-dev/meith',
      licence: 'MIT',
    },
    {
      key: 'future-thing',
      kind: 'plugin',
      package: '@meith/plugin-future-thing',
      name: 'Future Thing',
      description: 'Built for a plugin-kit major this board does not run yet.',
      screenshots: ['/marketplace/screenshots/future-thing-light.png'],
      version: '2.0.0',
      apiVersion: 9,
      meith: '>=9 <10',
      repository: 'https://github.com/meith-dev/meith',
      licence: 'MIT',
    },
  ],
}

const PNG = samplePng(40, 30)

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${E2E_FAKE_MARKETPLACE_PORT}`)

  if (url.pathname === '/v1.json') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(FEED))
    return
  }

  if (url.pathname === '/invalid.json') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ schema: 'x', listings: [{ key: 'not-enough-fields' }] }))
    return
  }

  if (url.pathname.startsWith('/marketplace/screenshots/') && url.pathname.endsWith('.png')) {
    response.writeHead(200, { 'content-type': 'image/png' })
    response.end(PNG)
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain' })
  response.end('not found')
})

server.listen(E2E_FAKE_MARKETPLACE_PORT, '127.0.0.1', () => {
  // biome-ignore lint/suspicious/noConsole: this is a process; its output is its status
  console.log(`fake marketplace listening on http://127.0.0.1:${E2E_FAKE_MARKETPLACE_PORT}`)
})
