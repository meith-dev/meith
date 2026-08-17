import { ValidationError } from '@meith/core'

export const PATH_SEPARATOR = '.'

export function formatPath(ids: readonly number[]): string {
  return ids.join(PATH_SEPARATOR)
}

export function parsePath(path: string): number[] {
  if (path === '') return []
  return path.split(PATH_SEPARATOR).map((segment) => {
    const id = Number(segment)
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError(`Malformed forum path segment: ${segment}`)
    }
    return id
  })
}

export function ancestorIds(path: string): number[] {
  const ids = parsePath(path)
  return ids.slice(0, -1)
}

export function depthOf(path: string): number {
  return Math.max(parsePath(path).length - 1, 0)
}

export function childPath(parentPath: string | null, childId: number): string {
  return parentPath === null || parentPath === ''
    ? String(childId)
    : `${parentPath}${PATH_SEPARATOR}${childId}`
}

export function isInSubtree(candidate: string, ancestor: string): boolean {
  if (candidate === ancestor) return true
  return candidate.startsWith(`${ancestor}${PATH_SEPARATOR}`)
}

export function subtreeOf(path: string): { exact: string; prefix: string } {
  return { exact: path, prefix: `${path}${PATH_SEPARATOR}%` }
}

export function rehang(descendantPath: string, oldRoot: string, newRoot: string): string {
  if (!isInSubtree(descendantPath, oldRoot)) {
    throw new ValidationError(`${descendantPath} is not inside ${oldRoot}; refusing to rehang it`)
  }
  return `${newRoot}${descendantPath.slice(oldRoot.length)}`
}
