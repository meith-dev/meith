import { readFile } from "node:fs/promises";
// Minimal zero-dependency dev server for the meith app-basic template.
//
// It serves index.html and prints a `Local: http://localhost:<port>` line so
// meith's DevServerService can sniff the listening port from stdout. The port
// defaults to 5173 and can be overridden with the PORT env var.
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 5173;

const server = createServer(async (req, res) => {
  try {
    const html = await readFile(join(root, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`Failed to read index.html: ${err.message}`);
  }
});

server.listen(port, () => {
  console.log("app-basic ready");
  console.log(`  Local: http://localhost:${port}`);
});
