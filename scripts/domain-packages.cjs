const { readdirSync } = require('node:fs')
const { join } = require('node:path')

const INFRASTRUCTURE = new Set([
  'core',
  'create-meith',
  'db',
  'demo',
  'drivers',
  'plugin-kit',
  'runtime',
  'testkit',
  'theme-kit',
  'ui',
])

function domainPackages() {
  return readdirSync(join(__dirname, '..', 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !INFRASTRUCTURE.has(entry.name))
    .map((entry) => entry.name)
    .sort()
}

module.exports = { INFRASTRUCTURE, domainPackages }
