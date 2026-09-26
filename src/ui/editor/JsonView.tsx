import { useEffect, useRef } from 'react';
import { defaultKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { bracketMatching, codeFolding, foldGutter, foldKeymap } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { followColorScheme, jsonTheme } from './theme';

interface JsonViewProps {
  /** Text to show. Highlighted as JSON; anything else still displays, just uncolored. */
  value: string;
  className?: string;
}

/**
 * Read-only, highlighted, foldable, searchable JSON viewer (CodeMirror 6).
 *
 * CodeMirror renders only the lines in view, so there is no size cap here —
 * callers are responsible for not *building* absurdly large strings.
 *
 * The EditorView is created once per mount and never recreated on render;
 * a changed `value` is swapped in with a transaction. Read-only, not
 * non-editable: the content stays focusable, so selection, copy and Cmd+F work.
 */
export function JsonView({ value, className }: JsonViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Last text handed to the editor. Comparing against this avoids calling
  // doc.toString() — a full copy of a possibly huge document — on every render.
  const shown = useRef(value);

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: shown.current,
        extensions: [
          EditorState.readOnly.of(true),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          codeFolding(),
          foldGutter(),
          bracketMatching(),
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([...searchKeymap, ...foldKeymap, ...defaultKeymap]),
          EditorView.lineWrapping,
          json(),
          jsonTheme,
          followColorScheme()
        ]
      })
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || value === shown.current) return;
    shown.current = value;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className={'json-view' + (className ? ' ' + className : '')} />;
}
