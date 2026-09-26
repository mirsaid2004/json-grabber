# JSON Grabber (local dev tool)

A local, unpacked Chrome extension (Manifest V3) that adds a **JSON Grabber**
DevTools panel. While DevTools is open on a tab, it captures JSON network
**response bodies** and lets you export them as files.

React + TypeScript, bundled with esbuild. Run `npm run build` before loading
the extension.

## Build

The panel is React + TypeScript, bundled by esbuild into `extension/panel.js`.
That file is build output — edit `src/`, not it.

```
npm install
npm run build      # or: npm run watch
```

Other scripts: `npm run typecheck` (tsc, no emit).

To work on the panel's layout without reloading the extension every time, serve
the repo and open the harness — it mounts the real bundle in an ordinary tab
with a stubbed `chrome.devtools` API and a few fake captures:

```
python3 -m http.server 8777
open http://localhost:8777/dev/harness.html?w=560   # ?w= sets the panel width
```

## Install

1. `npm install && npm run build` — the extension will not load without
   `extension/panel.js` present
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `extension/` folder in this repo

After a rebuild, close and reopen DevTools to pick up the new panel. If you
changed `manifest.json` or `devtools.js`, also click the reload icon on the
extension card first.

## Use

1. Open DevTools on the tab you want to capture (F12 / ⌥⌘I)
2. Select the **JSON Grabber** tab
3. Browse the page — captures appear in the list as requests finish

Tick rows to select them; a **Compose** button appears in the toolbar when a
selection exists. See [Composer](#composer).

**DevTools must stay OPEN on that tab.** `chrome.devtools.network.onRequestFinished`
only fires while the DevTools window for that tab is open; nothing is captured
when it is closed. That is the accepted tradeoff of this approach — in exchange
there is no "extension is debugging this browser" banner, and response bodies
come back clean from `getContent()`.

### Filter

The **URL filter** box is a case-insensitive substring match. A request is kept
if **either**:

- its response MIME type contains `json`, **or**
- the URL contains the filter string

Empty filter = capture all JSON. The filter is read at capture time, so it
applies to **new** requests going forward, not to rows already in the list.
Everything else (CSS, JS, images, fonts) is skipped.

### List

Each row shows a shortened URL, HTTP status, and body size. Click a row to
expand it and see the pretty-printed body (`JSON.parse` → `JSON.stringify(…, 2)`;
if parsing fails, the raw text is shown). The header shows a running
"N captured" counter.

### Export

There are three ways to get captures out. All of them write
`application/json` Blobs through the same anchor download helper.

**Export** — one button that follows the selection. With nothing ticked it
reads **Export all**; tick some rows and it becomes **Export selected (3)** and
acts on just those. The dropdown next to it picks the format either way:

- **Single JSON** — one `.json` file containing an array of the capture objects
- **Separate files** — one `.json` file per capture, named
  `NNN-<sanitized-url-slug>.json` (the index prefix prevents collisions)

**Save** — the small button at the right of each row immediately downloads just
that one capture as a single `.json` file, same naming scheme. No selection
needed.

The `NNN` prefix is the capture's position in the store, so a file keeps the
same name however it was exported. Clicking a checkbox or Save does not expand
the row.

**Clear** empties the store, the list, and the selection.

Chrome may show a "Download multiple files?" prompt the first time you use
**Separate files** on a site — allow it. Multi-file downloads are staggered by
150 ms because Chrome drops rapid-fire programmatic download clicks.

## Composer

The Composer builds **one JSON document out of several captured responses**.

1. Tick one or more rows, then click **Compose (n)** in the toolbar — the side
   panel opens with those captures already in it.
2. **Drag more rows in** from the capture list at any time. Dragging a row that
   is part of the selection carries the whole selection; dragging an unselected
   row carries just that one. Captures already in the composition are skipped.
3. Choose the wrapper: **{ } Object** or **[ ] Array**.
   - *Object* — each capture becomes a named field. The key is guessed from the
     URL (`/v1/users/42` → `users`) and is editable inline. Duplicate keys are
     suffixed `users_2`, `users_3`, so nothing is silently overwritten.
   - *Array* — each capture becomes an element, in the order listed.
4. The **Preview** pane shows the composed document live.
5. **Copy** puts it on the clipboard; **Export** writes `composed-<timestamp>.json`.

Drag the panel's left edge to resize it. **×** closes it — the composition is
kept, so reopening with Compose picks up where you left off.

A response body that is not valid JSON is included as a raw string rather than
dropped, and its row is tagged `raw` so you can see why the output looks odd.
Removing a capture from the capture list leaves the composition entry showing
`(capture cleared)` with an empty body; remove it with **×**.

Composing reads only the response bodies your browser already received. It
issues no requests of its own.

## Implementation notes

### Download method: anchor + Blob, not `chrome.downloads`

The spec allowed either. This uses `URL.createObjectURL` + a synthetic `<a download>`
click, and the manifest therefore requests **no** `downloads` permission.

Reason: DevTools panel pages only get `chrome.devtools.*`, `chrome.runtime` and
`chrome.extension`. `chrome.downloads` is not exposed there, so using it would
mean adding a background service worker purely to relay messages. The Blob
anchor works directly from the panel and keeps the extension to the files listed
in the spec.

### Storage

Captures live in a plain in-memory store. **They are lost when the DevTools
window closes or the panel reloads** — there is no `localStorage`,
`sessionStorage`, or `chrome.storage` use. Export before closing DevTools.

Response bodies are held in a `Map` inside the store, deliberately *outside*
React state; only small per-capture metadata is rendered, and a body is read
back on demand when a row expands or an export runs. That keeps a few thousand
captures cheap to render.

### Responsive layout

The panel's usable width depends on the composer, not the window, so layout
rules use **container queries** (`container-type: inline-size` on the capture
column and on the composer) rather than media queries.

Capture column, as it narrows:

| Width | Behavior |
| --- | --- |
| wide | one toolbar row: filter, Clear, actions, counter |
| ≤ 560px | filter + Clear keep the top row; actions wrap underneath |
| ≤ 440px | Size column hidden |
| ≤ 320px | Status column hidden too |

Composer: below 340px the Object/Array buttons drop to `{ }` / `[ ]` (tooltips
carry the meaning), below 300px the key inputs narrow, below 260px the
"Composer" title is dropped.

Toolbar controls are `flex: 0 0 auto; white-space: nowrap` so they wrap to a new
row rather than shrinking into each other.

> One gotcha worth remembering: `container-type` on an element makes its width
> independent of its content. A button that accidentally matched the layout
> column's `.primary` rule collapsed to its padding because of it — hence the
> deliberately distinct `.compose-btn` class.

### Layering

```
engine/   pure logic — no browser, no React, no chrome APIs
   ↑
capture/  chrome.devtools listener + in-memory store — no React
   ↑
ui/       React components
```

Dependencies point in one direction only. The capture layer is the part that
must not break when the UI changes, and the engine is unit-testable without a
browser — the React tree also renders headlessly via `react-dom/server`, which
is why the `useSyncExternalStore` calls pass a `getServerSnapshot`.

### Permissions: none

The manifest requests no `permissions` and no `host_permissions`. The network
log reaches the panel through the DevTools connection to the inspected tab, not
through host access, and downloads go through a Blob anchor rather than
`chrome.downloads`.

`host_permissions: ["<all_urls>"]` was present in earlier versions and removed
as unnecessary. If some future feature does need host access, scope it to the
narrowest pattern that works rather than reinstating `<all_urls>`:

```json
"host_permissions": ["https://api.example.com/*"]
```

## Scope — what this tool deliberately does not do

- **Response bodies only.** Each capture object holds exactly
  `{ url, status, mimeType, body, timestamp }`. Request and response headers,
  cookies, `Authorization` headers, and any auth/session tokens are never read,
  stored, logged, or exported.
- **No request replay.** There is no re-fire, token-reuse, or export-as-curl
  feature. It only reads and saves responses your own browser session already
  received while you were viewing the page.
- **No network of its own.** No external servers, no analytics, no telemetry.
  Everything stays on your machine.

## Files

```
src/
  panel.tsx           entry — mounts <Panel/> into #root
  engine/
    bytes.ts          byteLength, formatSize
    json.ts           safeParse, prettyPrint
    url.ts            shortUrl, slugFromUrl, urlMatches
    compose.ts        compose(), keyFromUrl(), uniqueKey() — the mesh seed
  capture/
    types.ts          Capture (the export shape) + CaptureMeta (the UI shape)
    listener.ts       chrome.devtools.network.onRequestFinished wrapper
  store/
    captureStore.ts   in-memory store; bodies in a Map, meta snapshot for React
    logStore.ts       panel log lines
  ui/
    Panel.tsx         shell: filter, selection, composition state, listener wiring
    Captures.tsx      toolbar + capture table
    Row.tsx           one row: checkbox, drag source, expand, Save
    Composer.tsx      resizable side panel: drop target, wrapper, preview
    LogView.tsx       panel log footer
    download.ts       Blob-anchor download helpers
    dnd.ts            drag-and-drop payload helpers
dev/
  harness.html        loads the built panel in a normal tab with a stubbed
                      chrome API and fake captures, for iterating on layout
                      without reloading the extension (not part of it)
  icon.svg            icon source of truth
  icon-small.svg      simplified 16px variant (braces only)
  icon.html           previews both at each size and rasterizes them to PNG
extension/
  icons/              icon16/32/48/128.png, generated from dev/*.svg
  manifest.json       MV3 manifest, devtools_page entry
  devtools.html       loads devtools.js
  devtools.js         registers the panel (plain JS, not bundled)
  panel.html          shell page — #root + built bundle
  panel.js            BUILD OUTPUT from src/panel.tsx — do not edit
  panel.css           styling
legacy/               the pre-React plain-JS panel, kept for reference
PRIVACY.md            published privacy policy (Chrome Web Store listing)
README.md
```

## Icon

`dev/icon.svg` is the source; `extension/icons/*.png` are generated from it.
The 128px artwork is braces around a download arrow. Below ~24px the arrow turns
to mush, so `dev/icon-small.svg` drops it and thickens the braces — that variant
is used for the 16px PNG only.

To change the icon: edit the SVG, serve the repo, and open
`http://localhost:8777/dev/icon.html`. It previews every size on light and dark
backgrounds; right-click a canvas to save it over the matching PNG. The PNGs are
committed because Chrome loads them directly — there is no icon build step in
`npm run build`.

## Roadmap

The Composer currently does flat, manual composition: pick captures, wrap them
in an object or array, export. Natural next steps, roughly in order:

- **Reordering** array elements (drag within the composition).
- **Nesting** — wrap a subset into a nested object/array rather than only the root.
- **Picking a path** into a body (`data.items`) instead of embedding the whole
  response.
- **Joining** on a key — the actual mesh idea: `users` × `orders` on
  `user.id === order.userId`.
- **Saved rules** that re-run automatically as matching captures arrive.

Three constraints worth knowing before building those:

- **No `eval` / `new Function`** — MV3 CSP blocks both on extension pages. User
  authored transforms need either a bundled expression language or a sandboxed
  page (`"sandbox": { "pages": [...] }`), which talks over `postMessage`.
- **Joins are asynchronous** — the two responses a rule needs may arrive
  seconds apart, out of order, or not at all, so rule evaluation has to be
  re-triggered as captures land rather than run once.
- **Rules will need persistence** even though captures do not.
