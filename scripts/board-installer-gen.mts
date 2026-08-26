#!/usr/bin/env -S npx tsx
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  DEFAULT_REPOSITORY_URL,
  nextSteps,
  type ScaffoldOptions,
  scaffold,
} from '../packages/create-meith/src/scaffold.ts'
import { ROOT } from './workspace-packages.mjs'

export const OUTPUT_FILE = 'apps/web/public/create-board.sh'
export const NAME_PLACEHOLDER = '__MEITH_BOARD_NAME__'
export const HEREDOC_DELIMITER = 'MEITH_SCAFFOLD_EOF'
export const NAME_PATTERN = '^[a-z0-9][a-z0-9._-]{0,213}$'

export function scaffoldOptionsFor(version: string): ScaffoldOptions {
  return { name: NAME_PLACEHOLDER, version, repositoryUrl: DEFAULT_REPOSITORY_URL }
}

export function renderInstallerScript(files: ReadonlyMap<string, string>): string {
  for (const [path, content] of files) {
    if (content.includes(HEREDOC_DELIMITER)) {
      throw new Error(`board-installer-gen: ${path} contains the heredoc delimiter itself.`)
    }
  }

  const writes = [...files]
    .map(([path, content]) => {
      const target = `"$BOARD_NAME/${path}"`
      const body = content.endsWith('\n') ? content : `${content}\n`
      return (
        `mkdir -p "$(dirname -- ${target})"\n` +
        `cat > ${target} <<'${HEREDOC_DELIMITER}'\n` +
        `${body}${HEREDOC_DELIMITER}`
      )
    })
    .join('\n\n')

  return `#!/bin/sh
set -e

BOARD_NAME=\${1:-}
if [ -z "$BOARD_NAME" ]; then
  echo "create-board: a board name is required." >&2
  echo "Usage: curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- my-board" >&2
  exit 1
fi

if ! printf '%s' "$BOARD_NAME" | grep -Eq '${NAME_PATTERN}'; then
  echo "create-board: use lower-case letters, digits, dots, hyphens and underscores, starting with a letter or digit." >&2
  exit 1
fi

if [ -d "$BOARD_NAME" ] && [ -n "$(ls -A "$BOARD_NAME" 2>/dev/null)" ]; then
  echo "create-board: $BOARD_NAME already exists and is not empty." >&2
  echo "Refusing to write into it — pick another name, or empty it first." >&2
  exit 1
fi

mkdir -p "$BOARD_NAME"

${writes}

find "$BOARD_NAME" -type f -exec sh -c \\
  'sed "s/${NAME_PLACEHOLDER}/$1/g" "$2" > "$2.meith-tmp" && mv "$2.meith-tmp" "$2"' \\
  _ "$BOARD_NAME" {} \\;

GIT_READY=0
if command -v git >/dev/null 2>&1 \\
  && git -C "$BOARD_NAME" init -q -b main >/dev/null 2>&1 \\
  && git -C "$BOARD_NAME" add -A >/dev/null 2>&1; then
  GIT_READY=1
fi

echo "Created $BOARD_NAME — ${files.size} files."
echo
${nextSteps('$BOARD_NAME')
  .map((step) => `echo "  ${step}"`)
  .join('\n')}
echo
if [ "$GIT_READY" = 1 ]; then
  echo "Initialized a git repository here and staged every file. Commit it,"
  echo "add a GitHub remote and push:"
  echo
  echo "  git commit -m \\"Scaffold $BOARD_NAME\\""
  echo "  git remote add origin https://github.com/<you>/$BOARD_NAME.git"
  echo "  git push -u origin main"
else
  echo "Push it to a new, empty repository on GitHub:"
  echo
  echo "  cd $BOARD_NAME"
  echo "  git init && git add -A && git commit -m \\"Scaffold $BOARD_NAME\\""
  echo "  git remote add origin https://github.com/<you>/$BOARD_NAME.git"
  echo "  git push -u origin main"
fi
echo
echo "Then set DATABASE_URL, AUTH_SECRET and TICK_SECRET and deploy."
echo "Something must run the tick every minute — the worker process, or"
echo "community task:run. Without it nothing catches up, and nothing errors."
`
}

async function main() {
  const rootManifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const version = rootManifest.version as string

  const files = scaffold(scaffoldOptionsFor(version))
  const script = renderInstallerScript(files)

  const outputPath = join(ROOT, OUTPUT_FILE)
  const check = process.argv.includes('--check')

  if (check) {
    const existing = await readFile(outputPath, 'utf8').catch(() => null)
    if (existing !== script) {
      console.error(
        `✗ ${OUTPUT_FILE} is stale — run \`pnpm board-installer:gen\` and commit the result.`,
      )
      process.exit(1)
    }
    console.log(`${OUTPUT_FILE} is up to date.`)
    return
  }

  await writeFile(outputPath, script, 'utf8')
  console.log(`Wrote ${OUTPUT_FILE} (${files.size} files, version ${version}).`)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await main()
}
