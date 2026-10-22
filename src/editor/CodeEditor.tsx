/**
 * CodeMirror 6 GLSL editor with compiler diagnostics shown inline.
 * The editor is uncontrolled for performance; external source changes
 * (undo, mutation, revert) are dispatched into it when they differ.
 */
import { autocompletion, closeBrackets, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, HighlightStyle, indentOnInput, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { shader } from '@codemirror/legacy-modes/mode/clike';
import { lintGutter, setDiagnostics, type Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import type { Diagnostic } from '../glsl/adapter';

const glslLang = StreamLanguage.define(shader);

const GLSL_WORDS = [
  'float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4', 'sampler2D', 'uniform', 'const', 'in', 'out', 'inout', 'precision', 'highp', 'mediump', 'lowp',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt', 'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp', 'mix',
  'step', 'smoothstep', 'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract', 'texture', 'texture2D', 'dFdx', 'dFdy', 'fwidth',
  'iTime', 'iResolution', 'iMouse', 'iFrame', 'iTimeDelta', 'iDate', 'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3', 'mainImage', 'fragColor', 'fragCoord', 'gl_FragCoord', 'gl_FragColor',
];

function glslCompletions(ctx: CompletionContext) {
  const word = ctx.matchBefore(/\w+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  return { from: word.from, options: GLSL_WORDS.map((w) => ({ label: w, type: /^[a-z]+\d?$/.test(w) && w.length < 9 && !w.startsWith('i') ? 'keyword' : 'variable' })) };
}

const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'rgb(var(--bg))', color: 'rgb(var(--fg))' },
    '.cm-content': { caretColor: 'rgb(var(--accent))', fontFamily: 'var(--editor-font)' },
    '.cm-gutters': { backgroundColor: 'rgb(var(--panel))', color: 'rgb(var(--muted))', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgb(var(--panel2) / 0.6)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgb(var(--panel2))' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgb(var(--accent) / 0.25) !important' },
    '.cm-tooltip': { backgroundColor: 'rgb(var(--panel))', border: '1px solid rgb(var(--line))' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c792ea' },
  { tag: [t.typeName, t.className], color: '#ffcb6b' },
  { tag: [t.number, t.bool], color: '#f78c6c' },
  { tag: t.comment, color: '#7a8296', fontStyle: 'italic' },
  { tag: [t.string, t.meta], color: '#89ddff' },
  { tag: t.operator, color: '#89ddff' },
  { tag: t.function(t.variableName), color: '#82aaff' },
]);

export interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  diagnostics?: Diagnostic[];
  fontSize?: number;
  ariaLabel?: string;
  /** Line to scroll to and select when it changes. */
  revealLine?: { line: number; nonce: number } | null;
}

export function CodeEditor({ value, onChange, diagnostics = [], fontSize = 13, ariaLabel = 'GLSL source', revealLine }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const fontComp = useRef(new Compartment());
  onChangeRef.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          lintGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          autocompletion({ override: [glslCompletions] }),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          glslLang,
          syntaxHighlighting(highlight),
          darkTheme,
          fontComp.current.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external changes (undo, mutation, revert) into the editor.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== value) v.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: fontComp.current.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })) });
  }, [fontSize]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const cm: CMDiagnostic[] = diagnostics
      .filter((d) => d.line !== null && d.origin === 'user' && d.line >= 1 && d.line <= doc.lines)
      .map((d) => {
        const line = doc.line(d.line!);
        return { from: line.from, to: Math.max(line.from, line.to), severity: d.severity === 'info' ? 'info' : d.severity, message: d.message };
      });
    v.dispatch(setDiagnostics(v.state, cm));
  }, [diagnostics, value]);

  useEffect(() => {
    const v = view.current;
    if (!v || !revealLine) return;
    const doc = v.state.doc;
    if (revealLine.line < 1 || revealLine.line > doc.lines) return;
    const line = doc.line(revealLine.line);
    v.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    v.focus();
  }, [revealLine]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" style={{ ['--editor-font' as string]: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace' }} />;
}
