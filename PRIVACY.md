# Privacy Policy — JSON Grabber

**Last updated: 23 August 2026**

## Summary

JSON Grabber does not collect, transmit, sell, or share any data. Everything it
reads stays on your own computer.

## What the extension does

JSON Grabber adds a panel to Chrome DevTools. While DevTools is open on a tab,
the panel reads JSON network **response bodies** from that tab's DevTools
network log, so you can view, filter, combine and export them as `.json` files.

## What it accesses

For each captured response the extension holds exactly five fields:

- the request URL
- the HTTP status code
- the response MIME type
- the response body
- a local timestamp

It does **not** read request headers, response headers, cookies, `Authorization`
headers, or any other authentication or session token. It has no
request-replay feature: it only reads responses your browser already received
while you were viewing the page.

## Where that data goes

Nowhere. Specifically:

- **No servers.** The extension makes no network requests of its own and has no
  backend.
- **No analytics or telemetry.** No usage data, crash reports, or identifiers of
  any kind are generated or sent.
- **No third parties.** Nothing is shared with, sold to, or transferred to
  anyone.
- **No persistent storage.** Captures are held in memory only. They are
  discarded when you close DevTools, reload the panel, or press Clear. The
  extension does not use `localStorage`, `sessionStorage`, `chrome.storage`, or
  any other persistence.
- **Exports are local files.** When you click Save, Export or Copy, the file is
  written by your browser to your own machine, or placed on your own clipboard.
  Nothing is uploaded.

## Permissions

The extension requests no Chrome permissions and no host permissions. It uses
only the DevTools panel APIs available to a `devtools_page`, which operate on the
tab you have chosen to inspect.

## Remote code

The extension executes no remote code. All of its JavaScript, including its
React dependency, is bundled into the extension package at build time.

## Changes to this policy

Any change will be published here with an updated date.

## Contact

<!-- Replace with the address you want listed publicly. -->
Questions about this policy: YOUR-CONTACT-EMAIL
