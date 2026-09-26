import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * Editor look. Every color is a CSS custom property defined in panel.css, so
 * light/dark switching is plain CSS and the palette lives in one place.
 */

const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--json-key)' },
  { tag: tags.string, color: 'var(--json-string)' },
  { tag: tags.number, color: 'var(--json-number)' },
  { tag: [tags.bool, tags.null], color: 'var(--json-literal)' },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: 'var(--json-punct)' }
]);

const baseLook = EditorView.theme({
  '&': {
    fontSize: 'inherit',
    backgroundColor: 'var(--editor-bg)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    overflow: 'auto'
  },
  '.cm-content': { padding: '4px 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-gutter)',
    borderRight: '1px solid var(--border)'
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--hover)',
    border: '1px solid var(--border)',
    color: 'inherit',
    padding: '0 4px'
  },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--editor-match)',
    outline: '1px solid var(--border)'
  },
  '.cm-searchMatch': { backgroundColor: 'var(--editor-search)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--editor-search-current)' },
  '.cm-panels': { backgroundColor: 'var(--editor-bg)', color: 'inherit' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },

  // Search bar: CodeMirror's default is small gradient buttons that wrap badly in
  // a narrow composer. Restyled to match the panel's own bordered controls.
  '.cm-panel.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px 6px',
    padding: '4px 28px 4px 6px'
  },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
    font: 'inherit',
    margin: '0'
  },
  '.cm-textfield': {
    flex: '1 1 120px',
    minWidth: '0',
    padding: '2px 6px',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    background: 'transparent',
    color: 'inherit'
  },
  '.cm-button': {
    backgroundImage: 'none',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    padding: '1px 8px',
    color: 'inherit',
    cursor: 'pointer'
  },
  '.cm-button:hover': { background: 'var(--hover)' },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    whiteSpace: 'nowrap',
    opacity: '0.8'
  },
  '.cm-panel.cm-search [name=close]': {
    top: '4px',
    right: '6px',
    fontSize: '16px',
    lineHeight: '1',
    cursor: 'pointer'
  }
});

/**
 * CodeMirror's built-in chrome (selection, search panel inputs) picks its
 * colors from the `darkTheme` flag, which is fixed per editor state. This keeps
 * it in step with the OS setting, as the rest of the panel already is via
 * `color-scheme: light dark`.
 */
export function followColorScheme(): Extension {
  if (typeof matchMedia !== 'function') return [];
  const query = matchMedia('(prefers-color-scheme: dark)');
  const scheme = new Compartment();

  return [
    scheme.of(EditorView.darkTheme.of(query.matches)),
    ViewPlugin.define((view) => {
      const onChange = (event: MediaQueryListEvent) =>
        view.dispatch({ effects: scheme.reconfigure(EditorView.darkTheme.of(event.matches)) });
      query.addEventListener('change', onChange);
      return { destroy: () => query.removeEventListener('change', onChange) };
    })
  ];
}

export const jsonTheme: Extension = [baseLook, syntaxHighlighting(jsonHighlight)];
