# Security

Report vulnerabilities privately, through GitHub's **Report a vulnerability**
button (the repository's *Security* tab) — not in a public issue or pull
request. A report that includes the affected route or package, a reproduction,
and what an attacker gains lets us confirm it quickly; we will respond in the
advisory thread and credit you in the fix's release notes unless you ask
otherwise.

Fixes ship as patch releases on the newest release line, which is the line we
support. A board keeps itself safe by taking patches promptly — they never
carry migrations, so applying one is a redeploy and nothing else
([docs/upgrading.md](../docs/upgrading.md)).

Out of scope: reports against a board someone else operates (talk to its
operator), spam that the built-in controls are configured to allow, and
denial-of-service findings that amount to "a server can be sent traffic".
