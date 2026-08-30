# JSON Grabber — future plan

Living document. Records what is intended, why, and what is still undecided.
Items marked **Open** need a decision before they are built.

## The organising idea

The capture list and the composer used to overlap — both could produce "one file
with several responses in it". They are now split by purpose, and most decisions
below follow from that split:

| | Capture list | Composer |
| --- | --- | --- |
| What it is | Evidence: what the server actually returned | Workbench: a derived artifact you shape |
| Edited? | Never | Freely |
| Output | Faithful dump | Curated document |

Corollary: **edits live on the compose item, never on the capture.** The capture
store stays a faithful record.

## Fixed constraints

These do not change, whatever gets built:

- Response bodies only. The capture object stays exactly
  `{ url, status, mimeType, body, timestamp }` — no headers, cookies, or tokens.
- No request replay, ever. Read and save only.
- No servers, no analytics, no network calls of the extension's own.
- No remote code; everything bundles at build time (MV3 CSP forbids `eval`).
- Layering holds: `engine` (pure) ← `capture` (chrome APIs) ← `ui` (React).
  New logic goes in `engine` and is testable without a browser.

---

## Next

### 1. Free editing of a composed item

Edit the JSON of any response after dragging it into the composer.

**Design**

- Store the edit as an override on the compose item (`edited?: string`). The
  original body in `captureStore` is never mutated. Show an "edited" badge on
  the item and offer Revert.
- Raw textarea, not a tree editor. Parse on a debounce; keep invalid text rather
  than discarding the user's work; show the parse error inline; the composed
  preview falls back to the last valid parse instead of blanking or crashing.
- The editor takes over the lower pane rather than expanding inline — the
  composer is too narrow for an inline editor. Tabs: `Preview` (composed result)
  and `Edit` (the selected item).
- Non-JSON bodies edit the same way and compose as strings, as today.

**Known limitation.** A free-text edit is a snapshot and cannot re-run. When
saved rules arrive (below), edited items are dead ends. The re-runnable sibling
is path selection (§4) — build both; they are not the same feature.

### 2. Reorderable composition

Drag items within the composer to reorder them.

**Design**

- Order is semantic in array mode, and still visible in object mode since JSON
  preserves key insertion order. Enable it in both.
- Use a **second MIME type** for internal reorder drags, distinct from the
  `application/x-json-grabber-ids` used to add from the table. Without this the
  drop handler cannot tell "reorder" from "add" and reordering will append
  duplicates.
- Show a drop-indicator line between items rather than highlighting a target.
- **Accessibility:** drag-only reordering excludes keyboard users. Ship ▲▼
  buttons or `alt+↑/↓` at the same time, not later.

### 3. Rework the export control

Replace the always-visible `[format select][Export]` pair with a single
**`Export ▾`** menu.

**Why.** "Single JSON" is now the composer's job, and the composer does it
better — order, keys, object-vs-array, and a live preview. Keeping a second,
worse path to the same output in permanent toolbar space is not worth it. But
bulk-dumping N captures to N files is still a real use, so the *behaviour*
stays; only the always-on `<select>` goes.

**Menu items:** Export as one file · Export as separate files · Send to Composer.

Remember the last choice for the session. Putting "Send to Composer" here makes
the composer discoverable from where people already look for output.

**Open:** whether the per-row `Save` button survives, or becomes a row-hover
action to buy back horizontal space in narrow panels.

---

## Later

### 4. Path selection into a body

Embed `data.items` rather than the whole response. Declarative, so unlike a
free-text edit it re-runs when the capture changes. Pairs with §1: editing is
for one-offs, path selection is for anything you want to repeat.

**Open:** dotted path (`data.items[0].id`) vs full JSONPath. Start dotted.

### 5. Nesting

Wrap a subset of items into a nested object or array instead of only the root.
Turns the flat item list into a tree, which is the main UI cost.

### 6. Joining on a key

The original mesh idea: `users` × `orders` on `user.id === order.userId`.

**The hard part is not matching, it is timing.** Inputs arrive asynchronously —
the second response may land seconds later, out of order, twice with different
query params, or never. Rule evaluation must therefore be re-triggered as
captures land, not run once. Needs a policy for "which `/api/orders`?" (latest
wins / all / matched on a field).

### 7. Saved rules

Rules that re-run automatically as matching captures arrive.

- Rules must persist; captures still should not (§9).
- If rules ever need user-authored expressions, remember `eval` and
  `new Function` are blocked by MV3 CSP. Options: bundle an expression language
  (JMESPath, JSONata) or use a sandboxed page (`"sandbox": { "pages": [...] }`)
  talking over `postMessage`. Decide before building the rule UI — retrofitting
  is painful.

### 8. Display filter over captured rows

A search box that filters rows **already** in the list. Distinct from the
existing capture filter, which is forward-only and decides what gets stored.
Small, cheap, wanted every session.

### 9. Memory guard

Bodies accumulate with no cap; a long session on a busy app will bloat. Add
keep-last-N or a byte budget with eviction, surfaced in the panel log so
eviction is never silent.

**Open:** cap by count or by total bytes. Bytes is more honest, count is easier
to explain.

### 10. Persist preferences, not data

Persist UI state — filter text, composer width, wrap mode, export default — via
`localStorage` in the panel page.

Deliberately **not** persisting captures or compositions: a composition is a set
of capture ids, and captures do not survive a DevTools close, so a restored
composition would point at nothing. Composition persistence only becomes
meaningful if captures persist, which reopens the size question in §9.

**Open:** verify whether `chrome.storage.local` is reachable from a DevTools page
in current Chrome. If not, `localStorage` is the fallback (it works — the panel
is an extension-origin page) or relay through a service worker.

### 11. Virtualised capture list

Needed past roughly 1–2k rows. Bodies are already out of React state, so this is
a rendering change only.

---

## Filtering

### 12. One predicate engine, three consumers — prerequisite

There are three places that ask the same question — *does this capture match
this description?* — at three different moments:

- the capture gate (`shouldKeep`)
- the display filter (§8)
- rule triggers (§7)

Define a parsed predicate in `engine/` and give it three consumers. Otherwise
substring matching gets written three times and the copies drift. It is pure, so
it tests without a browser, and it makes a rule "a saved predicate plus an
action".

**Land this before §7, §8, and most of the filtering items below.**

### 13. Query grammar

A small grammar beats adding more input boxes:

```
url:/api/          status:>=400        mime:json
size:>10kb         body:"timeout"      -url:analytics
```

**Decision — `method:` is a filter input only.** Filtering by HTTP method is
genuinely useful, but `method` is not part of the five-field capture object and
that shape is an invariant. Resolution: read the method to decide keep/drop,
never store or export it. The invariant survives and the filter works. Write
this down rather than letting it drift.

### 14. Noise suppression — negation and a denylist

Negation (`-url:analytics`) matters more than it looks: most sessions are ~80%
noise from telemetry, Sentry, and hot-reload polling. Ship a built-in,
toggleable denylist of known-noisy hosts. This cuts clutter more than any other
single feature.

### 15. Status chips

Quick 2xx / 4xx / 5xx toggles alongside the query. Typing `status:>=400` works,
but clicking is faster and error-hunting is the common case.

### 16. Shape filters

Where this gets differentiating, because nobody else does it well:

```
has:data.items     type:array      count:>10      empty:false
```

"Only keep responses that actually contain a list of records" is a filter about
the JSON, not the URL — and it is the filter you want when hunting for the
endpoint that feeds a table.

### 17. Regex mode

A toggle between substring and regex. Cheap, but wrap it in try/catch and render
an invalid state rather than throwing on every keystroke.

---

## Automation

### 18. Collapse repeated identical responses

Polling endpoints bury everything else. Same URL + identical body → one row with
a ×N counter. The single biggest daily quality-of-life win on this list.

### 19. Diff on re-capture

The natural partner of §18: same URL, *different* body → badge it "changed" and
offer a diff against the previous capture. Together these turn a noisy log into
"here is what actually changed while I clicked around".

### 20. Merge paginated responses

Capture `?page=1…5` of one endpoint, then concatenate them into one array.

**This should be the first automation built, ahead of the general join in §6.**
It is the same-endpoint special case, so the matching problem that makes joins
hard — which `/api/orders`, arrived when? — does not exist. It delivers a
working automation, and the plumbing it needs is the plumbing the general join
needs later.

### 21. Session recording

Explicit start/stop with a label, so a bounded interaction gets captured
("checkout flow") rather than an ever-growing list. Exports group under that
name. A better mental model than an infinite log, and it makes the memory cap
(§9) mostly moot.

### 22. Sampling

Cap a polling endpoint at one capture per N seconds.

---

## Ranked above most of the roadmap

### 23. Schema / type inference

Infer a JSON Schema or a TypeScript interface from a captured body, and export
it. Pure function in `engine/`, testable without a browser. This is the feature
that would make people who do not need a JSON exporter still want the tool, and
it sits naturally beside hypertools' other converters.

### 24. Redaction on export

Auth headers are never captured — but bodies routinely contain emails, tokens
and JWTs, and exports are destined for repos as fixtures. Detect probable
secrets (JWT `eyJ…` shapes, emails, long hex, card-like digit runs), flag them,
and offer a "redact on export" toggle that replaces the values.

This closes the loop the project's own privacy stance opens, and it is the
difference between "a JSON dumper" and "a tool you can safely point at a
production app".

---

## Watch-outs

- **Auto-export on match is the one to avoid.** Programmatic downloads without a
  user gesture get throttled or blocked by Chrome, and silent file writes during
  browsing is unpleasant behaviour. Queue matches and let one click flush them.
- **Body search costs.** `body:"timeout"` scans every stored body on each
  keystroke. Debounce it, and consider a lowercase index alongside each capture.
- **Silent filtering is a trap.** Anything that drops or collapses captures must
  say so in the panel log. A filter that quietly hides things reads as a bug
  when you are hunting a request that "isn't showing up".

---

## Suggested order

1. §12 predicate engine — unblocks §7, §8, §13–§17
2. §18 + §19 dedupe and diff — noise into signal
3. §16 shape filters — the differentiator
4. §24 redaction — unlocks real-world use
5. §20 pagination merge — the tractable path into §6 joins

## Candidates, not committed

- **Export as MSW handler stubs.** Would turn the tool from a JSON exporter into
  a fixture generator for Mock Service Worker, which is a sharper product than
  "download some JSON". Speculative — depends on whether MSW is actually in the
  workflow.
- **Row-level Copy** for a single body. Trivial, useful.
- **Duplicate detection** when the same URL is captured repeatedly — collapse or
  badge repeats.
- **Diff two captures** of the same endpoint.

## Explicitly rejected

- `chrome.debugger` for capture — shows the "extension is debugging this
  browser" banner. The DevTools-must-be-open tradeoff is preferred and accepted.
- fetch/XHR monkey-patching — mangles bodies and misses non-page requests.
- Any request replay, token reuse, or export-as-curl feature. Out of scope by
  design, not by omission.
- Background capture with DevTools closed — not possible with this approach, and
  the alternatives are the two rejected above.

## Housekeeping

- This file supersedes the Roadmap section in `README.md`; that section should
  shrink to a link here.
- Anything in `engine/` gets tests alongside it — the compose helpers already
  have a suite that runs without a browser.
