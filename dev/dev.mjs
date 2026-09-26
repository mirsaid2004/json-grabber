// `npm run dev` — the fast loop for panel work.
//
//   1. Rebuilds src/panel.tsx -> extension/panel.js on every save (development
//      React, unminified, like `npm run watch`). Output is written to disk, so a
//      loaded unpacked extension picks it up too after DevTools is reopened.
//   2. Serves the repo root, so dev/harness.html can load the real bundle.
//   3. Opens the harness. It reloads itself after each rebuild via esbuild's
//      live-reload event stream (/esbuild).
//
// Flags: --port=8777  --w=900 (harness panel width)  --no-open
//
// Not part of the extension, and never shipped. Run `npm run build` before
// packaging — this leaves a development build in extension/panel.js.

import { execFile } from 'node:child_process';
import * as esbuild from 'esbuild';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  })
);
const port = Number(args.port ?? 8777);
const width = String(args.w ?? 900);

const ctx = await esbuild.context({
  entryPoints: ['src/panel.tsx'],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: 'chrome120',
  outfile: 'extension/panel.js',
  sourcemap: 'inline',
  logLevel: 'info'
});

await ctx.watch();
const server = await ctx.serve({ servedir: '.', port });
const url = `http://localhost:${server.port}/dev/harness.html?w=${width}`;
console.log(`\n  harness  ${url}\n  stop     Ctrl+C\n`);

if (!args['no-open']) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  execFile(opener, [url], () => {}); // best effort; the URL is printed above either way
}

process.on('SIGINT', async () => {
  await ctx.dispose();
  process.exit(0);
});
