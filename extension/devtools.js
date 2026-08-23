// Registers the "JSON Grabber" panel in DevTools.
chrome.devtools.panels.create(
  'JSON Grabber',
  '',            // no icon
  'panel.html',
  function () {
    // panel created; nothing else to do here
  }
);
