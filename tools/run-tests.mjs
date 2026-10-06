/**
 * Headless test runner for the SWiSH loader.
 *
 *   npm test
 *
 * Boots a Vite dev server in-process (so there is no port to coordinate and
 * nothing left running afterwards), then drives both browser harnesses with
 * Playwright at several viewport sizes.
 *
 * Exits non-zero on any failure, so it is usable as a CI gate.
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// NOT new URL(...).pathname - on Windows that yields "/D:/swish%20bag%20...",
// with a leading slash and percent-encoded spaces, which esbuild cannot open.
const CONFIG = fileURLToPath(new URL('../vite.config.js', import.meta.url));

/** Each harness, and the viewports it must pass at. */
const SUITES = [
  {
    name: 'selftest',
    path: '/tools/selftest.html',
    viewports: [{ width: 1280, height: 900, label: 'desktop' }]
  },
  {
    name: 'responsive',
    path: '/tools/responsive.html',
    viewports: [
      { width: 360, height: 740, label: 'mobile' },
      { width: 820, height: 1180, label: 'tablet' },
      { width: 1600, height: 900, label: 'desktop' }
    ]
  }
];

const PAGE_TIMEOUT_MS = 60_000;

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

async function startServer() {
  const server = await createServer({
    configFile: CONFIG,
    // Never pop a browser open, and never reuse the dev port.
    server: { open: false, port: 0, strictPort: false },
    logLevel: 'warn'
  });
  await server.listen();
  const addr = server.httpServer.address();
  return { server, origin: `http://localhost:${addr.port}` };
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    const msg = String(err && err.message);
    if (/Executable doesn't exist|please run|browserType.launch/i.test(msg)) {
      console.error(
        c.red('\nPlaywright has no browser installed.\n') +
          '  Run this once:  ' +
          c.bold('npm run test:install') +
          '\n'
      );
      process.exit(2);
    }
    throw err;
  }
}

/** Run one harness at one viewport and return its parsed result. */
async function runOnce(browser, origin, suite, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`uncaught: ${e.message}`));

  let text = '';
  let timedOut = false;
  let expected = [];
  try {
    await page.goto(origin + suite.path, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS
    });
    // The harnesses stamp the document title when they finish.
    await page.waitForFunction(
      () => /^(ALL PASS|FAIL |HARNESS ERROR)/.test(document.title),
      undefined,
      { timeout: PAGE_TIMEOUT_MS }
    );
    text = await page.locator('#out').innerText();
    // A harness may provoke console errors on purpose, to prove the loader
    // survives them. It declares those; everything else still fails the run.
    expected = await page.evaluate(() => window.__expectedConsoleErrors || []);
  } catch (err) {
    timedOut = true;
    text = `harness did not finish within ${PAGE_TIMEOUT_MS}ms\n${err.message}`;
    try {
      text += '\n' + (await page.locator('#out').innerText());
    } catch {
      /* the page may be in no state to read */
    }
  } finally {
    await context.close();
  }

  const unexpected = consoleErrors.filter((e) => !expected.some((x) => e.includes(x)));
  const failures = text.split('\n').filter((l) => /^FAIL\b/.test(l.trim()));
  const m = /RESULT (\d+)\/(\d+) passed/.exec(text);
  return {
    passed: m ? Number(m[1]) : 0,
    total: m ? Number(m[2]) : 0,
    failures,
    consoleErrors: unexpected,
    expectedCount: consoleErrors.length - unexpected.length,
    ok: !timedOut && !!m && m[1] === m[2] && unexpected.length === 0,
    text
  };
}

async function main() {
  let server;
  let browser;
  let bad = 0;

  // Always tear both down, including on Ctrl-C, so `npm test` can never
  // leave an orphaned server or browser behind.
  const shutdown = async () => {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  };
  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(130);
  });

  try {
    const started = await startServer();
    server = started.server;
    const origin = started.origin;
    browser = await launchBrowser();

    console.log(c.dim(`\nserving ${origin}\n`));

    for (const suite of SUITES) {
      for (const vp of suite.viewports) {
        const label = `${suite.name} @ ${vp.label} ${vp.width}x${vp.height}`;
        const r = await runOnce(browser, origin, suite, vp);

        if (r.ok) {
          const note = r.expectedCount
            ? c.dim(` (${r.expectedCount} expected console error${r.expectedCount > 1 ? 's' : ''})`)
            : '';
          console.log(`${c.green('PASS')}  ${label}  ${c.dim(`${r.passed}/${r.total}`)}${note}`);
        } else {
          bad++;
          console.log(`${c.red('FAIL')}  ${label}  ${c.dim(`${r.passed}/${r.total}`)}`);
          for (const f of r.failures) console.log(`        ${c.red(f)}`);
          for (const e of r.consoleErrors) console.log(`        ${c.red('console: ' + e)}`);
          if (!r.failures.length && !r.consoleErrors.length) {
            console.log(c.dim(r.text.split('\n').slice(0, 12).join('\n')));
          }
        }
      }
    }
  } catch (err) {
    console.error(c.red('\nrunner crashed:'), err);
    bad++;
  } finally {
    await shutdown();
  }

  console.log(bad ? c.red(`\n${bad} suite run(s) failed\n`) : c.green('\nall suites passed\n'));
  process.exit(bad ? 1 : 0);
}

main();
