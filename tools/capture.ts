// Take HALOCLINE's screenshots from a real Chrome running the game's own files, so every image in
// screenshots/ is an unedited render of game/. This is a development tool and is not part of the
// entry: it is not under game/, so the gate never sees it.
//
// How it works: it starts serve.ts's static server on a port, launches Chrome headless with the
// DevTools protocol open, opens ?shot=<scene>&seed=<n> for each shot in shots.json, waits for the
// page to set window.__shotReady (which the game sets after it has painted the staged scene), and
// writes the frame as a PNG at 1280x720. Chrome writes the picture itself, so nothing here edits,
// composites or borrows an image.
//
// Run: node tools/capture.ts [--chrome <path>] [--port 8099] [--only play]

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, normalize, sep } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..');
const gameRoot = resolve(here, '..', 'game');
const shots = JSON.parse(readFileSync(join(repoRoot, 'shots.json'), 'utf8')) as Shot[];
const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex === -1 ? null : args[onlyIndex + 1];
const chromeIndex = args.indexOf('--chrome');
const chromePath = chromeIndex === -1 ? defaultChrome() : args[chromeIndex + 1];

type Shot = { name: string; query: string };

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function defaultChrome(): string {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error('no Chrome found: pass --chrome <path>');
}

/** The same containment rule serve.ts uses, so the capture serves exactly what a player gets. */
function serveGame(port: number) {
  return new Promise<ReturnType<typeof createServer>>((done) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const decoded = decodeURIComponent(url.pathname);
      const wanted = decoded === '/' || decoded === '' ? '/index.html' : decoded;
      const target = join(gameRoot, normalize(wanted));
      if (!target.startsWith(gameRoot + sep) && target !== gameRoot) {
        response.writeHead(403).end('forbidden');
        return;
      }
      let stat;
      try {
        stat = statSync(target);
      } catch {
        response.writeHead(404).end('not found');
        return;
      }
      if (!stat.isFile()) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stat.size,
      });
      createReadStream(target).pipe(response);
    });
    server.listen(port, () => done(server));
  });
}

/** A very small DevTools-protocol client: enough for navigate, evaluate and screenshot. */
class Devtools {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (value: any) => void>();

  constructor(url: string) {
    this.socket = new WebSocket(url);
  }

  ready(): Promise<void> {
    return new Promise((done, fail) => {
      this.socket.addEventListener('open', () => done());
      this.socket.addEventListener('error', () => fail(new Error('devtools socket failed')));
      this.socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown };
        if (message.id === undefined) return;
        const resolve = this.pending.get(message.id);
        if (resolve === undefined) return;
        this.pending.delete(message.id);
        resolve(message.error ?? message.result);
      });
    });
  }

  /**
   * Send one protocol message. `sessionId` targets a flattened page session: without it the
   * message goes to the browser target, where Runtime.evaluate reaches no page and answers
   * undefined, which looks exactly like a page that never finished painting.
   */
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = this.nextId++;
    return new Promise((done) => {
      this.pending.set(id, done);
      const message = sessionId === undefined
        ? { id, method, params }
        : { id, method, params, sessionId };
      this.socket.send(JSON.stringify(message));
    });
  }

  close(): void {
    this.socket.close();
  }
}

/**
 * Poll the page until it reports the staged scene is painted, or give up. `send` must be the
 * PAGE session's send (a flattened session id included): Runtime.evaluate sent on the browser
 * socket evaluates in no page at all and always answers undefined.
 */
async function waitForShot(
  send: (method: string, params?: Record<string, unknown>) => Promise<any>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const answer = await send('Runtime.evaluate', {
      expression: 'window.__shotReady === true',
      returnByValue: true,
    });
    if (answer?.result?.value === true) return;
    await new Promise((done) => setTimeout(done, 60));
  }
  throw new Error('the scene never signalled ready');
}

async function main(): Promise<void> {
  const port = (() => {
    const at = args.indexOf('--port');
    return at === -1 ? 8099 : Number(args[at + 1]);
  })();

  const server = await serveGame(port);
  const profileDir = join(process.env.TEMP ?? '/tmp', `halocline-capture-${process.pid}`);
  mkdirSync(profileDir, { recursive: true });
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,720',
    '--hide-scrollbars',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Chrome prints the DevTools address on stderr once it is listening.
  const devtoolsUrl = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error('chrome did not report a devtools address')), 30000);
    let buffer = '';
    chrome.stderr?.on('data', (chunk) => {
      buffer += String(chunk);
      const match = buffer.match(/ws:\/\/[^\s]+/);
      if (match) {
        clearTimeout(timer);
        done(match[0]);
      }
    });
  });

  const browser = new Devtools(devtoolsUrl);
  await browser.ready();

  // Reuse the page Chrome already opened: navigating an existing target is reliable, while a
  // target created over the browser socket needs its own session wiring that this tool avoids.
  const targets = await browser.send('Target.getTargets');
  const existing = (targets.targetInfos as Array<{ type: string; targetId: string }>)
    .find((one) => one.type === 'page');
  if (existing === undefined) throw new Error('chrome opened no page target');
  const attached = await browser.send('Target.attachToTarget', {
    targetId: existing.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId as string;

  // Talk to the page through the flattened session.
  const page = {
    send: (method: string, params: Record<string, unknown> = {}) => browser.send(method, { ...params }, sessionId),
  };
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });

  const outDir = join(repoRoot, 'screenshots');
  mkdirSync(outDir, { recursive: true });

  for (const shot of shots) {
    if (only !== null && !shot.name.includes(only)) continue;
    const url = `http://127.0.0.1:${port}/index.html${shot.query}`;
    await page.send('Page.navigate', { url });
    await new Promise((done) => setTimeout(done, 350));
    await waitForShot(page.send, 25000);
    // One more frame, so the ping ring and any easing have advanced a step past ready.
    const frame = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const bytes = Buffer.from(frame.data, 'base64');
    const file = join(outDir, shot.name);
    writeFileSync(file, bytes);
    console.log(`${shot.name}: ${bytes.length} bytes from ${url}`);
  }

  browser.close();
  chrome.kill();
  server.close();
  await new Promise((done) => setTimeout(done, 300));
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    // A locked profile directory is harmless: it is under the temp folder.
  }
}

await main();
