# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An unpacked Chrome MV3 extension that adds a **JSON Grabber** DevTools panel. It captures
JSON network **response bodies** via `chrome.devtools.network.onRequestFinished` and
exports them as files. React + TypeScript, bundled by esbuild.

## Commands

```bash
npm install
npm run build       # esbuild: src/panel.tsx -> extension/panel.js (IIFE, target chrome120)
npm run watch       # same, --watch
npm run dev         # watch + serve + open the harness, live reload (dev/dev.mjs)
npm run typecheck   # tsc -b: app + tests, each under its own config
npm test            # jest
```

Tests are Jest + `ts-jest`, configured under `"jest"` in `package.json`. Test files are
`src/**/*.test.ts`.

TypeScript config is **solution-style**: `tsconfig.json` has no files of its own, only
`references` to `tsconfig.app.json` (panel code, `types: ["chrome"]`, tests excluded) and
`tsconfig.test.json` (tests only, `types: ["jest"]`, CommonJS for ts-jest). This is what
lets VS Code apply the right config per file — the editor only discovers files named
exactly `tsconfig.json`, so a test file excluded from it with no reference gets default
settings and no Jest types. It also keeps Jest globals out of panel code. Put new compiler
options in `tsconfig.app.json`; the test config extends it. Keep `engine/` and
`store/` free of browser APIs so they stay testable in Jest's `node` environment.

### Iterating on the panel

Reloading the extension for every change is slow. `dev/harness.html` mounts the **real
built bundle** in an ordinary tab with a stubbed `chrome.devtools` API and fake captures:

```bash
npm run dev                      # rebuild on save, serve, open harness, live reload
npm run dev -- --w=560 --port=8777 --no-open   # ?w= sets panel width
```

`dev/dev.mjs` uses esbuild's own `serve` + `watch`; the harness subscribes to its
`/esbuild` event stream and reloads on change (and closes the stream under any other static
server, so `python3 -m http.server` still works after `npm run build`). esbuild only emits a
change event when the **output** differs — `touch` on a source file does not reload. The
build is also written to disk, so a loaded unpacked extension gets it too after DevTools is
reopened. It is a development build: run `npm run build` before packaging.

Use this for anything layout- or UI-shaped. Only fall back to loading the extension when
the change touches the real network listener.

### Loading / reloading the extension

`chrome://extensions` → Developer mode → Load unpacked → select `extension/`.
`extension/panel.js` must exist first or the extension will not load.

After a rebuild: **close and reopen DevTools**. If `manifest.json` or `devtools.js`
changed, also hit reload on the extension card first.

## Architecture

Dependencies point one way only. This is the load-bearing rule of the codebase:

```
engine/   pure logic — no browser, no React, no chrome APIs
   ^
capture/  chrome.devtools listener + the Capture types — no React
store/    in-memory capture and log stores — no React, no chrome APIs
   ^
ui/       React components
```

New logic goes in `engine/` where it is testable without a browser. `capture/` and
`store/` are the layers that must keep working when the UI is rewritten.

### The two data shapes

`capture/types.ts` defines a boundary worth respecting:

- **`Capture`** — the export shape, exactly `{ url, status, mimeType, body, timestamp }`.
  This is a hard privacy contract, not a convenience type. Headers, cookies, and auth
  material are never read. Do not add fields.
- **`CaptureMeta`** — what React renders. Deliberately has **no `body`**, plus internal
  `id` / `seq` / `size` that never leave the panel.

### The store contract

`store/captureStore.ts` exports `createCaptureStore()` — a factory, so every test builds an
isolated instance — plus the one shared `captureStore` the panel uses. Methods are
closures over local state, never `this`, because they are passed unbound to
`useSyncExternalStore`. Invariants:

- `getSnapshot()` must return a **stable reference between mutations**. Mutations push
  into a private array and set a dirty flag; `getSnapshot()` re-slices only when dirty.
  Returning a fresh array unconditionally causes an infinite render loop. Snapshots are
  `readonly` and frozen outside production builds, so an in-place `sort()` by a consumer
  throws instead of silently desyncing the UI.
- Listener notification is **coalesced onto a microtask**: captures arriving in one tick
  cause one render. Tests must `await` a microtask before counting notifications.
- `getVersion()` changes whenever any data does. Memos that read bodies or meta through
  the store (`Composer.tsx`) depend on it, not on the capture array.
- The store is **capped** (`DEFAULT_CAPTURE_LIMIT`); the oldest capture's body is
  deleted and the drop is logged via `onEvict`.
- **Bodies live in a `Map`, outside React state.** Only the small meta array is
  snapshotted. A body is pulled on demand (`getBody(id)`) when a row expands or an export
  runs. Do not put bodies into props or state.

`getServerSnapshot` is passed as the third argument at both call sites (`Panel.tsx`,
`LogView.tsx`) so the tree can render headlessly via `react-dom/server`. Keep passing it.

`store/logStore.ts` is built the same way (`createLogStore()` + shared `logStore`) for the
footer log. It notifies synchronously and keeps the newest `DEFAULT_LOG_LIMIT` (500) lines.
`LogView` auto-scrolls in an effect on `lines`, and only while the user is already at the
bottom — never from a ref callback (React 19 treats a ref callback's return value as a
cleanup function).

### Composer

The capture list is **evidence** (never edited, faithful to what the server returned); the
composer is a **workbench** (freely shaped). The corollary drives most design decisions in
`future_plan.md`: **edits live on the compose item, never on the capture.** Never mutate a
stored body.

`engine/compose.ts` is the pure core — `compose()`, `keyFromUrl()`, `uniqueKey()`.
Composition state (`ComposeItem[]`) lives in `Panel.tsx` and references captures **by id**.

### Drag and drop

Native HTML5 DnD with a custom MIME type (`ui/dnd.ts`), deliberately — it is the only
mechanism that carries a `DataTransfer` payload across the table→composer boundary.

The non-obvious constraint: **during `dragover` the payload is unreadable for security**,
only `dataTransfer.types` is. That is why `hasDragIds()` inspects `types` rather than
calling `getData()`. Do not "simplify" this.

If you add reorder-within-composer, it needs a **second, distinct MIME type** — otherwise
the drop handler cannot tell "reorder" from "add" and will append duplicates. See
`codebase-review.md` §4.3 for the dnd-kit tradeoff analysis before reaching for a library.

### JSON viewer

`ui/editor/JsonView.tsx` wraps CodeMirror 6 and is used for the row detail and the
composer preview. It renders only visible lines, so **there is no display size cap** —
the cost that remains is *building* the string, which is why the composer skips its
preview past `PREVIEW_MAX_INPUT` and builds the output on demand for Export / Copy.

- The `EditorView` is created **once per mount**; a changed `value` is swapped in with a
  transaction. Never recreate the view on render, and never compare against
  `doc.toString()` (a full copy) — the wrapper tracks the last value in a ref.
- `readOnly`, not `editable: false`, so the content stays focusable for selection,
  copy and Cmd+F.
- Colors are CSS custom properties in `panel.css` (`--json-*`, `--editor-*`), with a
  dark override under `prefers-color-scheme`. `theme.ts` only references them.
- All `@codemirror/*` packages must resolve to one copy each (`npm ls @codemirror/state`).
  Duplicates fail silently — most visibly as highlighting that does nothing.
- The harness tab is often **hidden** under automation, and CodeMirror measures and
  draws on `requestAnimationFrame`, which doesn't fire in hidden tabs. A check that
  reads the DOM after scrolling will see stale lines; take a screenshot to force a
  paint. The harness has a ~60k-line fixture (`catalog?all=true`) for size checks.

### Layout

Panel width depends on the composer, not the window, so `extension/panel.css` uses
**container queries** (`container-type: inline-size`), not media queries.

Gotcha documented in the README and worth repeating: `container-type` makes an element's
width independent of its content. A button that accidentally matched the `.primary` layout
rule collapsed to its padding — hence the deliberately distinct `.compose-btn` class.

## Hard constraints

These hold regardless of what is being built:

- **Response bodies only.** No headers, cookies, or tokens — ever read, stored, logged, or
  exported.
- **No request replay.** No re-fire, no token reuse, no export-as-curl. Read and save only.
- **No network of the extension's own.** No servers, analytics, or telemetry.
- **No `eval` / `new Function`.** MV3 CSP blocks both on extension pages. Everything
  bundles at build time. User-authored transforms would need a bundled expression language
  or a sandboxed page talking over `postMessage`.
- **No manifest permissions.** `permissions` and `host_permissions` are both absent and
  should stay that way. The network log arrives through the DevTools connection, not host
  access; downloads go through a Blob anchor because `chrome.downloads` is not exposed to
  DevTools panel pages. If a future feature genuinely needs host access, scope it narrowly
  rather than reinstating `<all_urls>`.
- **Captures are in-memory only** and are lost when DevTools closes. No `localStorage`,
  `sessionStorage`, or `chrome.storage`. (`future_plan.md` notes that saved *rules* will
  eventually need persistence even though captures do not.)

## Things that will bite you

- **`extension/panel.js` is build output** (gitignored). Edit `src/`, never it.
- **`extension/icons/*.png` have no build step** and are committed because Chrome loads
  them directly. Regenerate from `dev/icon.svg` via `dev/icon.html` (serve the repo, then
  right-click a canvas to save over the PNG). `dev/icon-small.svg` is a separate simplified
  variant used only for 16px.
- **`seq` and capture ids are separate counters.** `seq` numbers export files and resets
  on `clear()`; the id counter never resets, so a cleared id is never reused
  (`codebase-review.md` §1.1). Composer items are still not pruned on clear — they show
  "(capture cleared)" rather than resolving to a different capture.
- **`StrictMode` is on** (`src/panel.tsx`), so in `npm run dev` / `watch` builds every
  effect runs mount → unmount → mount. Effects must clean up after themselves, and
  one-off side effects (like the "panel ready" log line) don't belong in effects at all —
  they print twice. Production builds are unaffected.
- **The URL filter does not filter the list.** It is OR'd into the capture predicate
  (`shouldKeep`): JSON mime types are always kept, and the filter *additionally* captures
  matching non-JSON URLs, for new requests only. It reads through a ref so edits apply
  without re-attaching the listener.
- **`legacy/`** is the pre-React plain-JS panel, kept for reference only. Not built, not
  shipped.
- **`extension.zip` is a committed build artifact** and shows up dirty in `git status`.

## Living documents

- `future_plan.md` — what is intended and why; items marked **Open** need a decision before
  they are built. Read before starting roadmap work.
- `codebase-review.md` — audit of known bugs, performance issues, and the dnd-kit analysis,
  with a suggested work order.
- `README.md` — user-facing docs plus implementation rationale (download method, layering,
  permissions).
- `PRIVACY.md` — the published Chrome Web Store privacy policy. Changes to what is captured
  must stay consistent with it.
