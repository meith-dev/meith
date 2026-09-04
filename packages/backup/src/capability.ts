export type BackupCapability = 'available' | 'fixture' | 'serverless'

export function backupCapability(environment: {
  readonly DATA_SOURCE?: string | undefined
  readonly VERCEL?: string | undefined
}): BackupCapability {
  if (environment.DATA_SOURCE !== 'postgres') return 'fixture'
  if (environment.VERCEL !== undefined && environment.VERCEL !== '') return 'serverless'
  return 'available'
}
