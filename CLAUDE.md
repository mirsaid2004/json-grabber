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
npm run typecheck   # tsc --noEmit
```

**There is no test runner and no `test` script.** `engine/` is pure and browser-free by
design, so adding one needs no new dependencies — Node's built-in runner plus type
stripping (`node --experimental-strip-types --test 'src/**/*.test.ts'`). See
`codebase-review.md` §7 before proposing anything heavier.

### Iterating on the panel

Reloading the extension for every change is slow. `dev/harness.html` mounts the **real
built bundle** in an ordinary tab with a stubbed `chrome.devtools` API and fake captures:

```bash
npm run build
python3 -m http.server 8777
open http://localhost:8777/dev/harness.html?w=560   # ?w= sets panel width
```

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
capture/  chrome.devtools listener + in-memory store — no React
   ^
ui/       React components
```

New logic goes in `engine/` where it is testable without a browser. `capture/` is the
layer that must keep working when the UI is rewritten.

### The two data shapes

`capture/types.ts` defines a boundary worth respecting:

- **`Capture`** — the export shape, exactly `{ url, status, mimeType, body, timestamp }`.
  This is a hard privacy contract, not a convenience type. Headers, cookies, and auth
  material are never read. Do not add fields.
- **`CaptureMeta`** — what React renders. Deliberately has **no `body`**, plus internal
  `id` / `seq` / `size` that never leave the panel.

### The store contract

`capture/store.ts` is a framework-free module singleton read through
`useSyncExternalStore`. Two invariants:

- `getSnapshot()` must return a **stable reference between mutations**. Any change to the
  meta array must produce a new array; any non-mutating call must return the same one.
  Returning a fresh array unconditionally causes an infinite render loop.
- **Bodies live in a `Map`, outside React state.** Only the small meta array is
  snapshotted. A body is pulled on demand (`getBody(id)`) when a row expands or an export
  runs. Do not put bodies into props or state.

`getServerSnapshot` is passed as the third argument at both call sites (`Panel.tsx`,
`LogView.tsx`) so the tree can render headlessly via `react-dom/server`. Keep passing it.

`ui/logStore.ts` mirrors the same subscribe/getSnapshot shape for the footer log.

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
- **Capture ids are `'c' + seq` and `clear()` resets `seq` to 0**, so ids are recycled.
  Composer items hold ids and are not pruned on clear — this is a live data-corruption bug,
  documented in `codebase-review.md` §1.1. Do not build anything else that keys off capture
  id until it is fixed.
- **`StrictMode` is disabled** in `src/panel.tsx`. The comment claims double-invoked effects
  would duplicate captures; that is inaccurate — the listener effect already returns a
  working `detach`. See `codebase-review.md` §1.4.
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
