// A tiny static server for game/ (Node 22, standard library only), so the entry can be played
// locally with no build step: `node serve.ts` serves game/ on http://localhost:8080 and opens
// it in the default browser. It sends the MIME types a canvas game needs, refuses any path
// outside game/, and does nothing else: a development convenience, not a web server.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const decoded = decodeURIComponent(url.pathname);
  const wanted = decoded === '/' || decoded === '' ? '/index.html' : decoded;
  // normalize collapses any .. before the containment check, so no path escapes game/.
  const target = join(root, normalize(wanted));
  // root is already resolved, so it uses the platform's separators; join does too. Comparing
  // the two without this would fail on Windows, where one holds / and the other \.
  if (!target.startsWith(root + sep) && target !== root) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('forbidden');
    return;
  }
  let stat;
  try {
    stat = statSync(target);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  if (!stat.isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => {
  const address = `http://localhost:${port}`;
  console.log(`halocline: serving game/ at ${address}`);
  if (args.includes('--open')) {
    const opener = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', address] : [address];
    spawn(opener, openerArgs, { detached: true, stdio: 'ignore' }).unref();
  }
});
