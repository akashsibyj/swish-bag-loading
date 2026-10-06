/**
 * Build the demo AND the browser test harnesses.
 *
 *   npm run build:harness
 *
 * `npm run build` deliberately emits only index.html - the harnesses expose
 * __debug scrubbing and have no business on a deployed site. This is the
 * escape hatch for checking a BUILT copy on a real device, where a dev server
 * is not available.
 *
 * It sets the flag in-process and calls Vite's API rather than shelling out
 * with `VAR=1 vite build`, which is not valid on Windows' cmd/PowerShell.
 */

import { build } from 'vite';
import { fileURLToPath } from 'node:url';

process.env.BUILD_HARNESS = '1';

// NOT new URL(...).pathname - on Windows that yields "/D:/swish%20bag%20...",
// with a leading slash and percent-encoded spaces, which esbuild cannot open.
const configFile = fileURLToPath(new URL('../vite.config.js', import.meta.url));

try {
  await build({ configFile });
} catch (err) {
  console.error(err);
  process.exit(1);
}
