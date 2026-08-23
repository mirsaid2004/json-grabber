import { shortUrl } from '../engine/url';
import type { Capture } from './types';

/**
 * Wraps chrome.devtools.network.onRequestFinished. Only fires while DevTools is
 * open on the inspected tab — the accepted tradeoff of this approach.
 */

export interface ListenerOptions {
  /** Read at capture time, so filter edits apply to new requests going forward. */
  shouldKeep(url: string, mimeType: string): boolean;
  onCapture(capture: Capture): void;
  onLog(message: string): void;
}

type FinishedRequest = chrome.devtools.network.Request;

/** Attaches the listener and returns a detach function. */
export function attachNetworkListener(opts: ListenerOptions): () => void {
  function handler(request: FinishedRequest): void {
    let url: string;
    let status: number;
    let mimeType: string;

    try {
      url = request.request.url;
      status = request.response.status;
      mimeType = request.response.content.mimeType || '';
    } catch {
      return; // malformed entry — never crash the panel
    }

    if (!opts.shouldKeep(url, mimeType)) return;

    try {
      request.getContent((content, encoding) => {
        try {
          if (encoding === 'base64') {
            opts.onLog('skipped (binary/base64 body): ' + shortUrl(url));
            return;
          }
          if (typeof content !== 'string' || content.length === 0) {
            opts.onLog('skipped (body unavailable or evicted): ' + shortUrl(url));
            return;
          }
          opts.onCapture({
            url,
            status,
            mimeType,
            body: content,
            timestamp: new Date().toISOString()
          });
        } catch (e) {
          opts.onLog('error handling body for ' + shortUrl(url) + ': ' + message(e));
        }
      });
    } catch (e) {
      opts.onLog('getContent() failed for ' + shortUrl(url) + ': ' + message(e));
    }
  }

  chrome.devtools.network.onRequestFinished.addListener(handler);
  return () => {
    chrome.devtools.network.onRequestFinished.removeListener(handler);
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
