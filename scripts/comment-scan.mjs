const DIRECTIVES = [
  'biome-ignore',
  'ts-expect-error',
  'ts-ignore',
  'ts-nocheck',
  'eslint-disable',
  'eslint-enable',
  'prettier-ignore',
  'v8 ignore',
  'c8 ignore',
  'istanbul ignore',
  '@ts-expect-error',
  '@ts-ignore',
  '@type',
  '@satisfies',
  '@typedef',
  '<reference',
]

const REGEX_PRECEDERS = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '^',
  '~',
  '<',
  '>',
  '\n',
])

const REGEX_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'do',
  'else',
  'yield',
  'await',
  'case',
])

function startsRegex(source, index) {
  let cursor = index - 1
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1
  if (cursor < 0) return true

  const previous = source[cursor]
  if (REGEX_PRECEDERS.has(previous)) return true
  if (!/[A-Za-z0-9_$]/.test(previous)) return false

  const end = cursor + 1
  while (cursor >= 0 && /[A-Za-z0-9_$]/.test(source[cursor])) cursor -= 1
  return REGEX_KEYWORDS.has(source.slice(cursor + 1, end))
}

function isDirective(text) {
  const bare = text.replace(/^[\s*/]+/, '')
  return DIRECTIVES.some((directive) => bare.startsWith(directive))
}

export function commentLines(source) {
  const found = new Map()
  const interpolations = []
  let line = 1
  let index = 0
  let inTemplate = false

  if (source.startsWith('#!')) {
    while (index < source.length && source[index] !== '\n') index += 1
  }

  const record = (startLine, text) => {
    const bare = text.replace(/^\s*\*?\s*/, '').trim()
    if (bare === '' || isDirective(text)) return
    found.set(startLine, bare)
  }

  while (index < source.length) {
    const char = source[index]

    if (inTemplate) {
      if (char === '\\') index += 2
      else if (char === '\n') {
        line += 1
        index += 1
      } else if (char === '$' && source[index + 1] === '{') {
        interpolations.push(0)
        inTemplate = false
        index += 2
      } else if (char === '`') {
        inTemplate = false
        index += 1
      } else index += 1
      continue
    }

    if (char === '\n') {
      line += 1
      index += 1
      continue
    }

    if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index)
      const stop = end === -1 ? source.length : end
      record(line, source.slice(index + 2, stop))
      index = stop
      continue
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end
      const body = source.slice(index + 2, stop)
      const directive = isDirective(body)
      let cursor = line
      for (const piece of body.split('\n')) {
        if (!directive) record(cursor, piece)
        cursor += 1
      }
      line += body.split('\n').length - 1
      index = end === -1 ? source.length : end + 2
      continue
    }

    if (char === '"' || char === "'") {
      index += 1
      while (index < source.length && source[index] !== char) {
        if (source[index] === '\\') index += 1
        else if (source[index] === '\n') line += 1
        index += 1
      }
      index += 1
      continue
    }

    if (char === '`') {
      inTemplate = true
      index += 1
      continue
    }

    if (interpolations.length > 0 && char === '{') {
      interpolations[interpolations.length - 1] += 1
      index += 1
      continue
    }

    if (interpolations.length > 0 && char === '}') {
      if (interpolations[interpolations.length - 1] === 0) {
        interpolations.pop()
        inTemplate = true
      } else interpolations[interpolations.length - 1] -= 1
      index += 1
      continue
    }

    if (char === '/' && startsRegex(source, index)) {
      index += 1
      let inClass = false
      while (index < source.length && source[index] !== '\n') {
        if (source[index] === '\\') index += 1
        else if (source[index] === '[') inClass = true
        else if (source[index] === ']') inClass = false
        else if (source[index] === '/' && !inClass) break
        index += 1
      }
      index += 1
      continue
    }

    index += 1
  }

  return found
}
