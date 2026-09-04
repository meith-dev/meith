import { spawn } from 'node:child_process'

import { ConfigurationError, processEnvironment, ValidationError } from '@meith/core'

export function missingToolError(command: string): ConfigurationError {
  return new ConfigurationError(
    `${command} was not found on PATH. The shipped image carries the postgres client ` +
      'tools; elsewhere install them (postgresql18-client on Alpine, ' +
      'postgresql-client on Debian and Ubuntu).',
  )
}

const POSTGRES_PARAMETERS: Readonly<Record<string, string>> = {
  application_name: 'PGAPPNAME',
  channel_binding: 'PGCHANNELBINDING',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  gssencmode: 'PGGSSENCMODE',
  options: 'PGOPTIONS',
  requirepeer: 'PGREQUIREPEER',
  sslcert: 'PGSSLCERT',
  sslcompression: 'PGSSLCOMPRESSION',
  sslcrl: 'PGSSLCRL',
  sslcrldir: 'PGSSLCRLDIR',
  sslkey: 'PGSSLKEY',
  sslmode: 'PGSSLMODE',
  sslpassword: 'PGSSLPASSWORD',
  sslrootcert: 'PGSSLROOTCERT',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
}

const INHERITED_POSTGRES_VARIABLES = [
  'PGAPPNAME',
  'PGCHANNELBINDING',
  'PGCONNECT_TIMEOUT',
  'PGDATABASE',
  'PGGSSENCMODE',
  'PGHOST',
  'PGHOSTADDR',
  'PGOPTIONS',
  'PGPASSWORD',
  'PGPORT',
  'PGREQUIREPEER',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLCERT',
  'PGSSLCOMPRESSION',
  'PGSSLCRL',
  'PGSSLCRLDIR',
  'PGSSLKEY',
  'PGSSLMODE',
  'PGSSLPASSWORD',
  'PGSSLROOTCERT',
  'PGTARGETSESSIONATTRS',
  'PGUSER',
]

export function postgresClientEnvironment(
  connectionString: string,
  variable: string,
): NodeJS.ProcessEnv {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new ValidationError(`${variable} must be a valid postgres:// connection string.`)
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new ValidationError(`${variable} must be a postgres:// connection string.`)
  }
  let database: string
  let username: string
  let password: string
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''))
    username = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  } catch {
    throw new ValidationError(`${variable} contains invalid percent-encoding.`)
  }
  if (url.hostname === '' || username === '' || database === '') {
    throw new ValidationError(`${variable} must include a host, user, and database name.`)
  }

  const childEnv: NodeJS.ProcessEnv = processEnvironment()
  for (const environmentVariable of INHERITED_POSTGRES_VARIABLES) {
    delete childEnv[environmentVariable]
  }
  Object.assign(childEnv, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: username,
    PGDATABASE: database,
  })
  if (password !== '') childEnv.PGPASSWORD = password

  for (const [parameter, environmentVariable] of Object.entries(POSTGRES_PARAMETERS)) {
    const value = url.searchParams.get(parameter)
    if (value !== null) childEnv[environmentVariable] = value
  }
  return childEnv
}

export async function run(
  command: string,
  args: readonly string[],
  childEnv: NodeJS.ProcessEnv = processEnvironment(),
  input?: string,
): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: childEnv,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      reject((error as NodeJS.ErrnoException).code === 'ENOENT' ? missingToolError(command) : error)
    })
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout)
      else {
        reject(
          new ConfigurationError(
            `${command} exited with ${code === null ? 'a signal' : `code ${code}`}.` +
              (stderr.trim() === '' ? '' : `\n${stderr.trim()}`),
          ),
        )
      }
    })
    if (input !== undefined && child.stdin !== null) {
      child.stdin.end(input)
    }
  })
}
