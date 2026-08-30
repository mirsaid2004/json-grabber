# JSON Grabber — codebase review

A deep read of all ~960 lines of `src/`, before touching `future_plan.md`.
Everything below is anchored to a `file:line` and, where I claimed a bug, I ran it.

---

## 0. The short version

The architecture is genuinely good. The `engine` ← `capture` ← `ui` layering is real
(not aspirational), the pure modules are actually pure, `Capture` is a hard five-field
boundary, and the "bodies live outside React state" decision in `capture/store.ts` is
the right instinct.

The problems are all *one layer down* from the architecture:

| Area | Verdict |
| --- | --- |
| Layering / module boundaries | Solid, keep it |
| Store design (`useSyncExternalStore`) | Right pattern, three real defects |
| Rendering performance | Quadratic; the comment in `store.ts:9` is not true today |
| Drag & drop | Correct for what it does; the *next* feature is where it breaks |
| Correctness bugs | 4 real ones, one is data-corrupting |
| Tests | Zero. Biggest single gap given the "mesh engine" plan |
| Accessibility | Not started |

Ranked worst-first below.

---

## 1. Correctness bugs

### 1.1 `clear()` resets the id counter → the composer silently rebinds to a different capture

`src/capture/store.ts:74-79`

```ts
clear(): void {
  bodies.clear();
  meta = [];
  seq = 0;      // <-- ids restart at "c1"
  emit();
}
```

Ids are derived from `seq` (`store.ts:37`, `const id = 'c' + seq`). The composer holds
`ComposeItem[]` **by id** (`Panel.tsx:23`) and is never pruned when the store is cleared.

Repro:

1. Capture `/api/users` → gets id `c1`. Drag it into the composer.
2. Hit **Clear**. `Panel.tsx` never clears `composeItems`, so the item still says `c1`.
   The composer correctly renders `(capture cleared)` (`Composer.tsx:163`) — fine so far.
3. Browse again. The next capture — say `/api/billing` — is assigned **`c1`**.
4. The composer row silently comes back to life pointing at `/api/billing`, and
   **Export writes the billing body under the `users` key.**

That is silent data corruption in the one artifact the tool exists to produce.

Two independent fixes, apply both:

```ts
// store.ts — never recycle ids. Keep the display counter separate from identity.
let seq = 0;      // display / filename number, may reset
let nextId = 0;   // identity, monotonic for the life of the panel

add(capture: Capture): void {
  seq += 1;
  nextId += 1;
  const id = 'c' + nextId;
  ...
}

clear(): void {
  bodies.clear();
  meta = [];
  seq = 0;        // nextId deliberately NOT reset
  emit();
}
```

and, in `Panel.tsx`, make Clear prune the composition (or at least tombstone it) rather
than leaving dangling ids around. Right now `Captures.clear()` (`Captures.tsx:29-33`)
calls `captureStore.clear()` and `onClearSelection()` but nothing tells the composer.

---

### 1.2 `uniqueKey` treats every `Object.prototype` member as a taken key

`src/engine/compose.ts:38-43`

```ts
export function uniqueKey(taken: Record<string, unknown>, key: string): string {
  if (!(key in taken)) return key;   // <-- `in` walks the prototype chain
  ...
}
```

`compose()` builds `out` as a plain `{}` (`compose.ts:30`), so `'constructor' in {}` is
`true` before a single key has been added. I ran it:

```
constructor -> constructor_2
toString    -> toString_2
valueOf     -> valueOf_2
users       -> users          (correct)
__proto__   -> __proto___2
```

So `GET /api/constructor` composes under the key `constructor_2` with no second item in
sight. Niche, but it is exactly the kind of thing that makes a user distrust the tool.

Fix — one word, plus a safer container:

```ts
if (!Object.hasOwn(taken, key)) return key;
let n = 2;
while (Object.hasOwn(taken, key + '_' + n)) n += 1;
```

And build the output with a null-prototype object so `__proto__` can never hit the
setter path either. `JSON.stringify(Object.create(null))` works fine:

```ts
const out: Record<string, unknown> = Object.create(null);
```

---

### 1.3 `LogView`'s autoscroll works by accident and breaks on React 19

`src/ui/LogView.tsx:10`

```tsx
<pre className="log" ref={(el) => el && (el.scrollTop = el.scrollHeight)}>
```

Two problems stacked:

- **Why it currently works:** the arrow function is a new identity every render, so React
  detaches (`ref(null)`) and reattaches (`ref(el)`) on *every* render. It is relying on
  a re-render churn side effect, not on a documented lifecycle.
- **Why it will break:** React 19 treats a **returned value from a ref callback as a
  cleanup function**. `el.scrollTop = el.scrollHeight` is an assignment expression, so
  the arrow returns a *number*. React 19 rejects a non-function return from a ref callback.
  You are on React 18.3 today; this is a landmine on upgrade.

Fix:

```tsx
const ref = useRef<HTMLPreElement>(null);
useEffect(() => {
  const el = ref.current;
  if (el) el.scrollTop = el.scrollHeight;
}, [lines]);
return <pre className="log" ref={ref}>{lines.join('\n')}</pre>;
```

While you're in there: `logStore` (`logStore.ts:20`) is an **unbounded** `[...lines, x]`
append, and `LogView` does `lines.join('\n')` on every render. A long session on a chatty
page grows the log forever and re-joins the whole thing per render. Cap it:

```ts
const MAX_LINES = 500;
add(message: string): void {
  const next = [...lines, stamp + '  ' + message];
  lines = next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
  for (const listener of listeners) listener();
}
```

---

### 1.4 The `StrictMode` comment is wrong

`src/panel.tsx:4-5`

```
// No StrictMode: its double-invoked effects would attach the network listener
// twice in development and duplicate every capture.
```

That is not what happens. `useEffect` in `Panel.tsx:32-43` **returns `detach`**, and
`detach` calls `removeListener(handler)` with the same function reference. StrictMode's
mount → unmount → remount runs attach → detach → attach, leaving exactly one listener.
The cleanup is already correct; the mitigation is unnecessary.

This matters because StrictMode is the thing that would have caught the *actual* effect
bugs you'll hit when the composer starts holding editable state. I'd turn it on and
delete the comment. If you decide to keep it off for a different reason (e.g. you don't
want the double-render cost in a DevTools panel), write *that* reason down instead.

---

## 2. The store — you asked specifically about this

**`useSyncExternalStore` is the right call here and I would not replace it.** The reason
is stronger than "it's modern": your capture source is `chrome.devtools.network`, which
fires from **outside React's ownership** entirely. `useSyncExternalStore` is precisely the
API for that, and the "bodies in a `Map`, meta in the snapshot" split
(`store.ts:8-9`) is a genuinely good design that most people would have gotten wrong by
shoving 10MB response bodies into `useState`.

The implementation has three problems though.

### 2.1 The snapshot copy is O(n) per capture → O(n²) per session

`src/capture/store.ts:39-50`

```ts
meta = [ ...meta, { id, seq, url, ... } ];
```

Every capture copies the entire meta array. 2,000 captures = 2,000,000 element copies.
Combine that with §2.2 and the comment on `store.ts:9` — *"a few thousand captures stay
cheap to render"* — is not true. It's cheap in **memory**, which is what the comment
author was thinking about; it is not cheap in **time**.

The fix depends on how far you want to go:

- **Cheap:** keep the copy but batch emissions (§2.3). The copy is only quadratic because
  it happens per capture; batching 50 captures into one snapshot cuts it 50×.
- **Proper:** keep a mutable internal array and only rebuild the snapshot lazily in
  `getSnapshot()` when a dirty flag is set. `useSyncExternalStore` requires a stable
  reference *between mutations*, not an immutable append:

```ts
let metaMutable: CaptureMeta[] = [];
let snapshot: CaptureMeta[] = metaMutable;
let dirty = false;

getSnapshot(): CaptureMeta[] {
  if (dirty) { snapshot = metaMutable.slice(); dirty = false; }
  return snapshot;
}

add(capture: Capture): void {
  metaMutable.push({ ... });
  dirty = true;
  emit();
}
```

One `slice()` per *render*, not per *capture*.

### 2.2 Three separate O(n) `find()` scans on hot paths

| Location | Scan | Called |
| --- | --- | --- |
| `store.ts:63` | `meta.find(m => m.id === id)` in `toCapture` | once **per capture** in `downloadBundle` → O(n²) export |
| `Panel.tsx:64` | `meta.find(m => m.id === id)` in `addToComposition` | once per dropped id |
| `Composer.tsx:35` | `captures.find(c => c.id === item.id)` | once per compose item, **on every render** |

All three disappear with one index maintained alongside `meta`:

```ts
const byId = new Map<string, CaptureMeta>();
// add():   byId.set(id, entry);
// clear(): byId.clear();
// expose:  getMeta(id) { return byId.get(id) ?? null; }
```

Then `toCapture` is O(1), and `Composer` can call `captureStore.getMeta(item.id)`.

### 2.3 Every single capture triggers a full-table re-render

`store.ts:18-20` emits synchronously on every `add`. On a page doing 30–50 XHRs/second
(any dashboard, any infinite scroll) that is 50 renders/second of the **entire** capture
table, because:

- `captures` gets a new array identity every time (§2.1), and
- `Row` (`Row.tsx:17`) is **not** wrapped in `React.memo`, and
- `onDragStart` (`Captures.tsx:54`) is a fresh closure every render, so `memo` alone
  wouldn't have helped anyway.

Three-part fix:

```ts
// 1. store.ts — coalesce bursts into one emission per frame/microtask
let scheduled = false;
function emit(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const listener of listeners) listener();
  });
}
```

(A microtask keeps it synchronous-enough that `useSyncExternalStore` never tears. If you
want to be more aggressive under load, `requestAnimationFrame` is fine too — but then
`getSnapshot` must already reflect the mutation, which it does.)

```tsx
// 2. Captures.tsx — stabilise the callback
const onDragStart = useCallback((event: React.DragEvent, id: string) => {
  const ids = selected.has(id) ? [...selected] : [id];
  setDragIds(event.dataTransfer, ids);
}, [selected]);

// 3. Row.tsx — memoise
export const Row = memo(function Row({ meta, checked, onToggle, onDragStart }: RowProps) { ... });
```

`meta` objects are already immutable per id, so `memo`'s shallow compare is exactly right.

### 2.4 Unbounded memory, no eviction

`bodies` (`store.ts:12`) grows forever. There is no cap on capture count and no cap on
body size. A page streaming 5MB JSON payloads will put the DevTools panel process into
the hundreds of MB, and DevTools panels are not generous with memory.

Suggest a `MAX_CAPTURES` ring (drop oldest, log it — you already have a log surface for
exactly this kind of message) and optionally a `MAX_BODY_BYTES` skip with a log line,
matching the existing `skipped (binary/base64 body)` idiom in `listener.ts:39`.

---

## 3. Rendering & derived state

### 3.1 The composer preview rebuilds on every unrelated capture

`src/ui/Composer.tsx:42-49`

```ts
const output = useMemo(() => {
  const sources = items.map((item) => ({ key: item.key, body: captureStore.getBody(item.id) }));
  return JSON.stringify(compose(sources, mode), null, 2);
}, [items, mode, captures]);   // <-- `captures`
```

This is the worst hot spot in the UI. `captures` changes identity on **every capture**
(§2.1), so every new network request in the inspected tab re-parses and re-stringifies
the *entire composition*. If you've composed three 4MB responses, that's ~12MB of
`JSON.parse` + `JSON.stringify` per unrelated XHR.

There's also a correctness smell hiding here: the memo reads `captureStore.getBody()`,
which is **not in the dependency array**. It's accidentally correct today because bodies
are write-once. The moment `future_plan.md §1` (free editing of a composed item) lands,
this memo goes stale and the preview stops matching the export.

The fix that solves both: make the bodies a real dependency by keying on them.

```ts
// depend on identity of the bodies, not on the whole captures array
const bodyKey = items.map(i => i.id + ':' + (i.edited ?? '')).join('|');
const output = useMemo(() => { ... }, [items, mode, bodyKey]);
```

Better still, give the store a `getBodyVersion(id)` counter that bumps on edit, and
depend on that. Either way, drop `captures` from the deps.

Then wrap the *display* in `useDeferredValue` so typing in a key input
(`Composer.tsx:157`) doesn't block on re-stringifying megabytes:

```tsx
const deferredOutput = useDeferredValue(output);
```

### 3.2 Truncation happens after you've already paid for the full string

`Composer.tsx:11,51,188` — `PREVIEW_LIMIT = 200_000`, but `output` is built in full
first and only then sliced. The preview limit protects the **DOM**, not the CPU. Worth
short-circuiting: if the summed body sizes exceed some threshold, render a
"preview suppressed — N MB, export to see it" placeholder and skip `JSON.stringify`
entirely. The meta already carries `size` (`types.ts:24`), so this is cheap to check.

### 3.3 `Row` re-pretty-prints its body on every parent render

`src/ui/Row.tsx:22`

```ts
const body = open ? prettyPrint(captureStore.getBody(meta.id)) : '';
```

Not memoised. Every new capture re-renders every open row and re-runs
`JSON.parse` + `JSON.stringify(_, null, 2)` on its full body. With three rows expanded on
large payloads this alone will make the panel feel broken.

```ts
const body = useMemo(
  () => (open ? prettyPrint(captureStore.getBody(meta.id)) : ''),
  [open, meta.id]
);
```

And unlike the composer, the row detail has **no length cap at all** — `<pre>{body}</pre>`
at `Row.tsx:66` will happily push 10MB of text into the DOM. It should get the same
truncation treatment the composer preview has.

### 3.4 Resizing the composer re-renders the entire capture table at 60fps

`Composer.tsx:80-95` → `props.onResize(...)` → `setComposerWidth` in `Panel.tsx:25`.
`composerWidth` lives in `Panel` state, so every `pointermove` re-renders `Panel`,
`Captures`, and all N `Row`s. React.memo on `Row` (§2.3) fixes most of this. The cleaner
version writes the width to a CSS custom property via a ref during the drag and only
commits to state on `pointerup`:

```ts
function move(e: PointerEvent) {
  const next = clamp(startWidth + (startX - e.clientX));
  asideRef.current?.style.setProperty('width', next + 'px');  // no React render
  latest.current = next;
}
function up() { props.onResize(latest.current); /* one render */ ... }
```

Two smaller things in the same handler:

- No `setPointerCapture` — drag the mouse over an iframe or out of the panel and you
  lose the pointer stream.
- No `pointercancel` listener, so the `pointermove`/`pointerup` pair can leak if the
  gesture is cancelled by the OS or a touch interruption.

---

## 4. Drag & drop — you asked about dnd-kit

### 4.1 What you have is fine *for what it currently does*

`src/ui/dnd.ts` is 18 lines and it is the correct 18 lines. Specifically:

- Using a **custom MIME type** (`application/x-json-grabber-ids`) instead of `text/plain`
  is the right call — it means a drag from outside the panel can't be mistaken for a row.
- `hasDragIds()` (`dnd.ts:16`) reading `dataTransfer.types` instead of `getData()` shows
  you knew the payload is unreadable during `dragover`. Most hand-rolled implementations
  get this wrong and end up highlighting the dropzone for any dragged file.
- The `dragDepth` counter (`Composer.tsx:30`) is the standard, correct workaround for
  `dragenter`/`dragleave` firing on descendants.

**dnd-kit would be a downgrade for this specific interaction.** Native HTML5 DnD is the
only mechanism that carries a `DataTransfer` payload; dnd-kit is pointer-events-based and
models drag as internal React state. For a copy-from-list-into-panel gesture inside one
document, either works — but you'd be adding ~15–30KB to a DevTools panel to replace
something that already works.

### 4.2 Two small holes in the current implementation

**Asymmetric guard.** `onDragEnter` (`Composer.tsx:129-133`) returns early if
`!hasDragIds`, but `onDragLeave` (`Composer.tsx:139-142`) does **not** — it decrements
unconditionally. `Math.max(0, ...)` papers over it, but a drag that enters with a
foreign payload and leaves will still decrement, and interleaved drags can desync `over`.
Mirror the guard:

```tsx
onDragLeave={(e) => {
  if (!hasDragIds(e.dataTransfer)) return;
  dragDepth.current = Math.max(0, dragDepth.current - 1);
  if (dragDepth.current === 0) setOver(false);
}}
```

**No `dragend` reset.** If the user drops outside the window or hits Escape mid-drag,
`over` can be left stuck true. Add an `onDragEnd` on the source row (`Row.tsx:38`) or a
window-level `dragend` that force-resets `dragDepth` and `over`.

### 4.3 Where it *does* break: reorder (`future_plan.md §2`)

This is the real question. Native HTML5 DnD is bad at exactly the three things reorder
needs:

| Need | Native HTML5 DnD | dnd-kit |
| --- | --- | --- |
| Drop indicator *between* items | Manual: measure each `<li>`, compute midpoints on every `dragover` | Built in via `useSortable` + transform |
| Live reflow while dragging | Not possible — the drag image is a static bitmap | Free; items animate out of the way |
| Keyboard reorder | Nothing. You write it yourself | `KeyboardSensor` + `sortableKeyboardCoordinates` |
| Touch | Effectively unsupported | Built in |
| Payload across drop targets | Native only | Not supported (internal state only) |

Your own plan already says: *"drag-only reordering excludes keyboard users. Ship ▲▼
buttons or `alt+↑/↓` at the same time, not later."* That is the correct instinct, and it
also happens to be the cheapest path.

**My recommendation, concretely:**

1. **Ship ▲▼ / `alt+↑↓` reorder first, with no drag at all.** The composer holds a
   handful of items, not a hundred. `moveItem(items, from, to)` is a pure function that
   belongs in `engine/compose.ts` and is trivially testable. This delivers the whole
   feature — order is order — for maybe 40 lines, and it satisfies the a11y requirement
   by construction rather than as a bolt-on.

2. **Only then decide about drag.** If you do want drag-reorder:

   - **Do not** implement it with a second MIME type as the plan currently suggests
     *unless* you accept the manual midpoint math. The plan is right that you need a
     second MIME type to distinguish reorder from add — but that solves *disambiguation*,
     not *drop indicators*, which is the actually hard part.
   - **Do** reach for dnd-kit if you want it to feel good. `useSortable` gives you the
     indicator, the reflow, and keyboard support in one go.

3. **The tradeoff to be aware of if you pick dnd-kit:** you cannot mix it with the native
   `draggable` attribute on the same element. Native drag captures the pointer and
   dnd-kit's `PointerSensor` never sees the events. So dnd-kit inside the composer +
   native DnD from the table is fine (different elements), but the moment you want to
   drag a composer item *back out* to the table, you'd have to migrate `Row.tsx` off
   native DnD too — which means giving up the `DataTransfer` payload model entirely and
   moving the "what's being dragged" state into React. That's a bigger rewrite than it
   looks like from the outside.

**Bottom line:** your custom implementation isn't the naive choice people usually make —
it's a deliberate one that's correct for a cross-boundary copy gesture. Keep it for the
table→composer drag. For in-composer reorder, do buttons first; add dnd-kit only if
drag-feel is worth the coupling described in (3).

---

## 5. Accessibility

Nothing here is started, and it's cheap to fix while the surface is still small.

- **`Row.tsx:36-41`** — the expand toggle is `onClick` on a `<tr>`. Not focusable, no
  `role="button"`, no `tabIndex`, no `aria-expanded`, no Enter/Space handling. Keyboard
  users cannot expand a capture at all.
- **`Row.tsx:43-49`** — the checkbox has a `title` but no accessible label. A screen
  reader announces "checkbox" with no indication of which row. Needs
  `aria-label={'Select ' + shortUrl(meta.url)}`.
- **`Composer.tsx:152-158`** — the key `<input>` has a `title` but no `<label>` or
  `aria-label`.
- **`Composer.tsx:104-121`** — the segmented control is `role="group"` with two buttons.
  It's semantically a radio group; `role="radiogroup"` + `role="radio"` +
  `aria-checked` would be correct, or just use real radios and style them.
- **`Composer.tsx:99`** — the resize handle is a bare `<div>`. No keyboard resize, no
  `role="separator"` / `aria-orientation` / `aria-valuenow`.
- **`Captures.tsx:107`** — empty `<th />` cells with no `scope` or visually-hidden label.

None of this blocks shipping a local dev tool, but the ▲▼ decision in §4.3 means you're
about to make an a11y call anyway — worth doing a pass at the same time.

---

## 6. Capture layer

### 6.1 The "filter" doesn't filter the list

`Panel.tsx:34-37` — the filter is **OR'd** into `shouldKeep`: JSON mime types are always
kept, and the filter *additionally* captures non-JSON URLs that match. `README.md:59-67`
documents this clearly, so it's a deliberate design.

But the input is placeholder'd *"URL filter (substring, case-insensitive)"*
(`Captures.tsx:65`) and sits directly above a table it does not filter. Every user's
first assumption will be "typing here narrows what I see." It doesn't — it widens what
gets captured, going forward only.

Two things are worth separating here, and I'd do both:

- Rename this one to something like **"Also capture URLs matching…"** so its actual job
  is legible.
- Add a *real* display filter over the rendered rows. It's ~3 lines
  (`captures.filter(m => !q || urlMatches(m.url, q))`) and it's the thing people actually
  want after 400 captures. `urlMatches` (`url.ts:31`) already exists and already returns
  `false` for empty input — note you'd want the opposite default for a display filter, so
  guard the empty case at the call site rather than changing the helper.

### 6.2 No navigation boundary

`listener.ts` never listens to `chrome.devtools.network.onNavigated`. Captures from
before and after a page load pile up in one undifferentiated list. A separator row (or at
minimum a log line) would make long sessions much easier to read. Cheap.

### 6.3 mimeType detection is narrow

`Panel.tsx:35` — `mimeType.includes('json')` catches `application/json` and
`application/ld+json`, but a lot of APIs serve JSON as `text/plain` or
`application/octet-stream`. The URL filter is the escape hatch, which is presumably why
it's OR'd — but a "body starts with `{` or `[`" sniff would catch most of the rest
without touching the filter semantics.

### 6.4 No deduplication

Polling endpoints (a `/api/status` on a 2s interval) will flood the list with identical
captures. A "collapse consecutive identical (url, body-hash)" option, or just a count
badge, would help a lot. Not urgent.

---

## 7. Testing — the biggest gap

There is **no test file, no test runner, no `test` script**. Meanwhile `engine/` is
explicitly designed to be testable: `compose.ts`, `json.ts`, `url.ts`, `bytes.ts` are all
pure, browser-free, and total ~140 lines. `future_plan.md` calls this "the seed of the
mesh engine" — you are about to build significant logic on an untested foundation.

Both bugs in §1.1 and §1.2 are ones a single afternoon of engine tests would have caught.

You need **zero new dependencies**. Node's built-in test runner plus its type stripping:

```jsonc
// package.json
"scripts": {
  "test": "node --experimental-strip-types --test 'src/**/*.test.ts'"
}
```

The tests that would have earned their keep on day one:

```ts
// src/engine/compose.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueKey, keyFromUrl, compose } from './compose.ts';

test('uniqueKey ignores inherited Object.prototype members', () => {
  assert.equal(uniqueKey({}, 'constructor'), 'constructor');   // fails today
  assert.equal(uniqueKey({}, 'toString'), 'toString');         // fails today
});

test('uniqueKey suffixes real collisions', () => {
  assert.equal(uniqueKey({ users: 1 }, 'users'), 'users_2');
  assert.equal(uniqueKey({ users: 1, users_2: 1 }, 'users'), 'users_3');
});

test('keyFromUrl skips numeric and id-like segments', () => {
  assert.equal(keyFromUrl('https://x.dev/v1/users/42'), 'users');
  assert.equal(keyFromUrl('https://x.dev/api/orders.json'), 'orders');
  assert.equal(keyFromUrl('https://x.dev/a/0f8e7d6c5b4a39281706'), 'a');
  assert.equal(keyFromUrl('not a url'), 'response');
});

test('compose keeps unparseable bodies as raw strings', () => {
  const out = compose([{ key: 'k', body: 'not json' }], 'array');
  assert.deepEqual(out, ['not json']);
});
```

`captureStore` is framework-free by design, so it tests without a DOM too — and the
id-recycling bug in §1.1 is a four-line test:

```ts
test('ids are never reused after clear', () => {
  captureStore.add(sample('https://x.dev/a'));
  const firstId = captureStore.getSnapshot()[0].id;
  captureStore.clear();
  captureStore.add(sample('https://x.dev/b'));
  assert.notEqual(captureStore.getSnapshot()[0].id, firstId);  // fails today
});
```

(That store is a module singleton, which makes test isolation slightly awkward — `clear()`
between tests works, but a `createCaptureStore()` factory with the singleton as
`export const captureStore = createCaptureStore()` would be cleaner and costs nothing.)

---

## 8. Repo hygiene

- **`extension.zip` is committed and currently modified.** A 190KB build artifact in git,
  showing as `M` in `git status`. It should be in `.gitignore` and produced by a
  `npm run package` script, not tracked.
- **`.DS_Store` in the repo root and `extension/`,** untracked. Add `.DS_Store` to
  `.gitignore`.
- **No CI.** `npm run typecheck` exists and passes (I ran it — clean), but nothing runs
  it. A three-line GitHub Action doing `typecheck` + `test` + `build` would lock in §7.
- **Version drift.** `package.json` is `1.0.0` and `manifest.json` is `1.0.0` today, but
  they're maintained by hand and will diverge. Have the build stamp the manifest from
  `package.json`.
- **`manifest.json` has no `minimum_chrome_version`.** You build with
  `--target=chrome120`; declaring it in the manifest stops the extension from
  half-loading on older Chrome.
- **`legacy/` and `dev/` are unexplained.** `legacy/panel.js` + `legacy/panel.html` look
  like the pre-React version. Either a one-line README note about why they're kept, or
  delete them.
- **`download.ts:12`** hardcodes `type: 'application/json'` for every blob, including
  captures whose `mimeType` is not JSON. Cosmetic, but the raw-text path in the composer
  means non-JSON does flow through here.

---

## 9. Where I'd start

Ordered by (damage prevented) ÷ (effort):

1. **§1.1 id recycling** — silent wrong-data export. One-line fix, biggest payoff.
2. **§7 test harness + engine tests** — zero deps, and it's the prerequisite for building
   the mesh engine safely. Do it before `future_plan.md`, not after.
3. **§1.2 `uniqueKey`** — one word (`in` → `Object.hasOwn`), and you now have a test for it.
4. **§2.3 batch emissions + memo `Row`** — the panel stops feeling laggy on busy pages.
5. **§3.1 drop `captures` from the composer memo deps** — do this *before* §1 of the
   future plan (free editing), because that feature will otherwise ship broken.
6. **§1.3 `LogView` ref** + log cap — small, and unblocks a React 19 upgrade.
7. **§2.2 id→meta index** + **§2.4 capture cap** — the scaling work.
8. **§6.1 display filter / rename** — the highest-value pure-UX change.
9. **§4.3 ▲▼ reorder** — delivers `future_plan.md §2` with a11y built in; revisit dnd-kit
   after.
10. **§5 accessibility pass** — natural to fold into 9.

Items 1–3 are an afternoon. They're also the ones that stop the tool from lying to you.
