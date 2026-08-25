#!/usr/bin/env node
import { run } from './cli'

const result = await run(process.argv.slice(2), '0.18.0')
for (const line of result.lines) {
  if (result.code === 0) console.log(line)
  else console.error(line)
}
process.exit(result.code)
