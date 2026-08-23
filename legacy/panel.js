'use strict';

/**
 * JSON Grabber panel.
 *
 * Capture policy: RESPONSE BODIES ONLY. We deliberately read just the URL,
 * status, MIME type and body off each finished request. Request/response
 * headers, cookies and any auth material are never touched, stored or exported.
 */

/** @type {Array<{url: string, status: number, mimeType: string, body: string, timestamp: string}>} */
const captures = [];

/** Indices into `captures` whose row checkbox is ticked. @type {Set<number>} */
const selected = new Set();

const els = {
  filter: document.getElementById('filter'),
  clear: document.getElementById('clear'),
  format: document.getElementById('format'),
  export: document.getElementById('export'),
  exportSelected: document.getElementById('export-selected'),
  counter: document.getElementById('counter'),
  rows: document.getElementById('rows'),
  empty: document.getElementById('empty'),
  log: document.getElementById('log')
};

// ---------------------------------------------------------------- utilities

function log(message) {
  const line = new Date().toLocaleTimeString() + '  ' + message + '\n';
  els.log.textContent += line;
  els.log.scrollTop = els.log.scrollHeight;
}

function byteLength(str) {
  try {
    return new TextEncoder().encode(str).length;
  } catch (e) {
    return str.length;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.host + u.pathname + (u.search ? u.search : '');
  } catch (e) {
    return url;
  }
}

function prettyBody(body) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch (e) {
    return body;
  }
}

/** Sanitized slug from the URL path, used for "Separate files" export names. */
function slugFromUrl(url) {
  let path = '';
  try {
    const u = new URL(url);
    path = u.hostname + u.pathname;
  } catch (e) {
    path = String(url);
  }
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'capture';
}

// ------------------------------------------------------------------ capture

function shouldKeep(url, mimeType) {
  if ((mimeType || '').toLowerCase().includes('json')) return true;
  const filter = els.filter.value.trim().toLowerCase();
  if (filter && url.toLowerCase().includes(filter)) return true;
  return false;
}

chrome.devtools.network.onRequestFinished.addListener(function (request) {
  let url, status, mimeType;
  try {
    url = request.request.url;
    status = request.response.status;
    mimeType = request.response.content.mimeType || '';
  } catch (e) {
    return; // malformed entry — nothing we can do, never crash the panel
  }

  if (!shouldKeep(url, mimeType)) return;

  try {
    request.getContent(function (content, encoding) {
      try {
        if (encoding === 'base64') {
          log('skipped (binary/base64 body): ' + shortUrl(url));
          return;
        }
        if (typeof content !== 'string' || content.length === 0) {
          log('skipped (body unavailable or evicted): ' + shortUrl(url));
          return;
        }
        addCapture({
          url: url,
          status: status,
          mimeType: mimeType,
          body: content,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        log('error handling body for ' + shortUrl(url) + ': ' + e.message);
      }
    });
  } catch (e) {
    log('getContent() failed for ' + shortUrl(url) + ': ' + e.message);
  }
});

function addCapture(capture) {
  captures.push(capture);
  renderRow(capture, captures.length - 1);
  updateCounter();
}

// ------------------------------------------------------------------- render

function updateCounter() {
  els.counter.textContent = captures.length + ' captured';
  els.empty.style.display = captures.length ? 'none' : '';
}

function renderRow(capture, index) {
  const size = byteLength(capture.body);

  const row = document.createElement('tr');
  row.className = 'row';

  const checkCell = document.createElement('td');
  checkCell.className = 'cell-check';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.title = 'Select for "Export selected"';
  checkbox.addEventListener('click', function (event) {
    event.stopPropagation(); // don't toggle the row's expand/collapse
  });
  checkbox.addEventListener('change', function () {
    if (checkbox.checked) selected.add(index);
    else selected.delete(index);
    updateExportSelected();
  });
  checkCell.append(checkbox);

  const urlCell = document.createElement('td');
  urlCell.textContent = shortUrl(capture.url);
  urlCell.title = capture.url;

  const statusCell = document.createElement('td');
  statusCell.textContent = String(capture.status);
  if (capture.status >= 400) statusCell.className = 'status-err';

  const sizeCell = document.createElement('td');
  sizeCell.textContent = formatSize(size);

  const saveCell = document.createElement('td');
  saveCell.className = 'cell-save';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'save';
  saveButton.textContent = 'Save';
  saveButton.title = 'Download just this capture';
  saveButton.addEventListener('click', function (event) {
    event.stopPropagation(); // don't toggle the row's expand/collapse
    try {
      downloadCaptureAt(index);
      log('saved ' + shortUrl(capture.url));
    } catch (e) {
      log('save failed: ' + e.message);
    }
  });
  saveCell.append(saveButton);

  row.append(checkCell, urlCell, statusCell, sizeCell, saveCell);

  const detail = document.createElement('tr');
  detail.className = 'detail';
  detail.style.display = 'none';
  const detailCell = document.createElement('td');
  detailCell.colSpan = 5;

  const fullUrl = document.createElement('div');
  fullUrl.className = 'full-url';
  fullUrl.textContent = capture.url + '  ·  ' + (capture.mimeType || 'unknown') +
    '  ·  ' + capture.timestamp;

  const pre = document.createElement('pre');
  detailCell.append(fullUrl, pre);
  detail.append(detailCell);

  let rendered = false;
  row.addEventListener('click', function () {
    const open = detail.style.display === 'none';
    detail.style.display = open ? '' : 'none';
    row.classList.toggle('open', open);
    if (open && !rendered) {
      pre.textContent = prettyBody(captures[index].body);
      rendered = true;
    }
  });

  els.rows.append(row, detail);
}

// ------------------------------------------------------------------ actions

els.clear.addEventListener('click', function () {
  captures.length = 0;
  selected.clear();
  els.rows.textContent = '';
  updateCounter();
  updateExportSelected();
  log('cleared');
});

/**
 * Downloads via anchor + Blob + URL.createObjectURL. The chrome.downloads API
 * is not exposed to DevTools panel pages, so this is the reliable route here.
 */
function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}

function exportSingle() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  download('json-grabber-' + stamp + '.json', JSON.stringify(captures, null, 2));
  log('exported ' + captures.length + ' capture(s) as a single file');
}

/** Downloads one capture as its own file, named NNN-<slug>.json. */
function downloadCaptureAt(index) {
  const capture = captures[index];
  const name = String(index + 1).padStart(3, '0') + '-' + slugFromUrl(capture.url) + '.json';
  download(name, JSON.stringify(capture, null, 2));
}

/** Downloads the given capture indices, staggered — Chrome drops rapid-fire clicks. */
function downloadEach(indices) {
  indices.forEach(function (index, position) {
    setTimeout(function () {
      downloadCaptureAt(index);
    }, position * 150);
  });
}

function exportSeparate() {
  downloadEach(captures.map(function (capture, i) { return i; }));
  log('exporting ' + captures.length + ' capture(s) as separate files');
}

function updateExportSelected() {
  els.exportSelected.disabled = selected.size === 0;
  els.exportSelected.textContent = selected.size
    ? 'Export selected (' + selected.size + ')'
    : 'Export selected';
}

els.export.addEventListener('click', function () {
  if (!captures.length) {
    log('nothing to export');
    return;
  }
  try {
    if (els.format.value === 'separate') exportSeparate();
    else exportSingle();
  } catch (e) {
    log('export failed: ' + e.message);
  }
});

els.exportSelected.addEventListener('click', function () {
  if (!selected.size) return;
  try {
    const indices = Array.from(selected).sort(function (a, b) { return a - b; });
    downloadEach(indices);
    log('exporting ' + indices.length + ' selected capture(s) as separate files');
  } catch (e) {
    log('export failed: ' + e.message);
  }
});

updateCounter();
updateExportSelected();
log('panel ready — capturing while DevTools is open on this tab');
