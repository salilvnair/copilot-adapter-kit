import { lazy, Suspense } from 'react';
import type { EditorLanguage } from '@salilvnair/dui';

/**
 * Monaco, fetched the first time an editor is actually rendered.
 *
 * dui inlines all four language workers, so this is most of the panel's weight.
 * Two of the three Developer Tools tabs never open an editor, and neither does
 * any other screen — pulling it in at import time made every one of them wait
 * for it. `monaco-setup` wires the workers and has to run before the first
 * mount, so it is awaited here rather than imported at the top of a module.
 */
const LazyEditorView = lazy(async () => {
  await import('@salilvnair/dui/monaco-setup');
  const dui = await import('@salilvnair/dui');
  return { default: dui.EditorView };
});

export type CodeLanguage =
  | 'javascript' | 'json' | 'xml' | 'python' | 'text' | 'html'
  | 'typescript' | 'java' | 'graphql' | 'plaintext' | 'yaml';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeLanguage;
  readOnly?: boolean;
  placeholder?: string;
  height?: string;
  className?: string;
  wordWrap?: boolean;
  fontSize?: number;
}

// dui's EditorLanguage doesn't have a 'text' value — it's an alias for 'plaintext' here.
const LANG_MAP: Record<CodeLanguage, EditorLanguage> = {
  javascript: 'javascript', typescript: 'typescript', json: 'json', xml: 'xml',
  python: 'python', html: 'html', java: 'java', graphql: 'graphql',
  plaintext: 'plaintext', yaml: 'yaml', text: 'plaintext',
};

/**
 * Thin wrapper around dui's EditorView, the same one daakia has.
 *
 * Kept as its own component rather than calling EditorView at each site so the
 * gutter, the line highlight and the scrollbar are decided once. `debugSupported`
 * is what puts the line numbers there — without it the block renders as bare
 * syntax-highlighted text, which is what this looked like before.
 */
export function CodeEditor({
  value,
  onChange,
  language = 'text',
  readOnly = false,
  placeholder,
  height = '200px',
  className = '',
  wordWrap = false,
  fontSize = 12,
}: Props) {
  return (
    <Suspense fallback={
      <div style={{ height, display: 'flex', alignItems: 'center', padding: '0 12px',
                    fontSize: 11, color: 'var(--color-text-muted)' }}>
        Loading editor…
      </div>
    }>
    <LazyEditorView
      debugSupported
      bordered
      className={className}
      value={value}
      onChange={onChange}
      language={LANG_MAP[language]}
      readOnly={readOnly}
      placeholder={placeholder}
      height={height}
      wordWrap={wordWrap}
      fontSize={fontSize}
      editorOptions={{
        // dui's defaults for these are conditional on glyphMargin, so pin them.
        renderLineHighlight: 'line',
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
    </Suspense>
  );
}
