/**
 * The export object. RESPONSE BODIES ONLY — exactly these five fields, and
 * nothing else, is what gets stored and written to disk. Request/response
 * headers, cookies and any auth material are never read.
 */
export interface Capture {
  url: string;
  status: number;
  mimeType: string;
  body: string;
  timestamp: string;
}

/**
 * What the UI renders. Deliberately excludes `body` so React state stays small
 * — bodies are held in the store and fetched on demand. Never exported.
 */
export interface CaptureMeta {
  id: string;
  /** 1-based capture number; drives the NNN- filename prefix. */
  seq: number;
  url: string;
  status: number;
  mimeType: string;
  size: number;
  timestamp: string;
}
