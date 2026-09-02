import { BOARD_TITLE } from '@/view/board-title'

export const dynamic = 'force-static'

function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · ${BOARD_TITLE}</title>
<style>
:root {
  --offline-background: oklch(0.968 0 0);
  --offline-foreground: oklch(0.205 0 0);
  --offline-card: oklch(1 0 0);
  --offline-border: oklch(0.905 0 0);
  --offline-primary: oklch(0.508 0.105 165.6);
  --offline-primary-foreground: oklch(0.985 0 0);
  --offline-muted-foreground: oklch(0.494 0 0);
  --offline-radius: 0.5rem;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --offline-background: oklch(0.15 0 0);
    --offline-foreground: oklch(0.967 0 0);
    --offline-card: oklch(0.196 0 0);
    --offline-border: oklch(0.31 0 0);
    --offline-primary: oklch(0.773 0.153 163.2);
    --offline-primary-foreground: oklch(0.181 0.029 166.6);
    --offline-muted-foreground: oklch(0.702 0 0);
  }
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--offline-background);
  color: var(--offline-foreground);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
main {
  width: 100%;
  max-width: 24rem;
  padding: 2rem;
  text-align: center;
  background: var(--offline-card);
  border: 1px solid var(--offline-border);
  border-radius: var(--offline-radius);
}
h1 {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
}
p {
  margin: 0 0 1.5rem;
  color: var(--offline-muted-foreground);
  font-size: 0.9375rem;
  line-height: 1.5;
}
a.retry {
  display: inline-block;
  padding: 0.5rem 1.25rem;
  border-radius: var(--offline-radius);
  background: var(--offline-primary);
  color: var(--offline-primary-foreground);
  font-weight: 600;
  text-decoration: none;
}
</style>
</head>
<body>
<main>
<h1>${BOARD_TITLE}</h1>
<p>You're offline. Check your connection and try again.</p>
<a class="retry" href="/">Retry</a>
</main>
</body>
</html>
`
}

export function GET(): Response {
  return new Response(page(), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}
