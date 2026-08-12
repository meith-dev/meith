#!/usr/bin/env node
export function balancedBlock(source, from) {
  const start = source.indexOf('{', from)
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { body: source.slice(start + 1, i), end: i }
    }
  }
  return null
}

export function balancedList(source, from) {
  const start = source.indexOf('[', from)
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return source.slice(start + 1, i)
    }
  }
  return null
}

export function joinStringLiterals(fragment) {
  let out = ''
  for (let i = 0; i < fragment.length; i++) {
    if (fragment[i] !== "'") continue
    i++
    for (; i < fragment.length && fragment[i] !== "'"; i++) {
      if (fragment[i] === '\\') i++
      out += fragment[i]
    }
  }
  return out
}
