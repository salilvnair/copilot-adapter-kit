/**
 * MdViewer entry — imports marked + hljs, then runs the viewer setup.
 * Bundled with esbuild into media/md-viewer-bundle.js
 */
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import markdown from 'highlight.js/lib/languages/markdown';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import diff from 'highlight.js/lib/languages/diff';
import sql from 'highlight.js/lib/languages/sql';
import shell from 'highlight.js/lib/languages/shell';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('shell', shell);

// ─── Singleton guards ─────────────────────────────────────────────────────────
let _styleInjected = false;
let _markedConfigured = false;

// ─── CSS ──────────────────────────────────────────────────────────────────────
const MDV_CSS = `
.mdv-root {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-primary, #e4e4e7);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.mdv-root h1, .mdv-root h2, .mdv-root h3, .mdv-root h4, .mdv-root h5 {
  font-weight: 600;
  margin: 0.9em 0 0.35em;
  line-height: 1.3;
  color: var(--color-text-primary, #f4f4f5);
}
.mdv-root h1 { font-size: 1.22em; border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 0.3em; }
.mdv-root h2 { font-size: 1.1em; }
.mdv-root h3 { font-size: 1em; color: #c4b5fd; }
.mdv-root h4 { font-size: 0.9em; opacity: 0.8; }
.mdv-root h5 { font-size: 0.85em; opacity: 0.7; }

.mdv-root p { margin: 0.45em 0; }
.mdv-root p:first-child { margin-top: 0; }
.mdv-root p:last-child  { margin-bottom: 0; }

.mdv-root .mdv-inline-code,
.mdv-root code:not(.hljs) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace;
  font-size: 0.87em;
  background: rgba(139,92,246,0.13);
  color: #c084fc;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(139,92,246,0.22);
  letter-spacing: 0;
}

.mdv-root strong { font-weight: 650; color: #f4f4f5; }
.mdv-root em     { font-style: italic; color: #d4d4d8; }
.mdv-root del    { text-decoration: line-through; opacity: 0.55; }

.mdv-root a {
  color: var(--color-protocol-ai, #818cf8);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
.mdv-root a:hover { opacity: 0.8; }

.mdv-root hr { border: none; border-top: 1px solid rgba(255,255,255,0.09); margin: 0.9em 0; }

.mdv-root ul, .mdv-root ol {
  padding-left: 1.35em;
  margin: 0.35em 0;
}
.mdv-root li { margin: 0.18em 0; }
.mdv-root ul > li::marker { color: rgba(139,92,246,0.7); }
.mdv-root ol > li::marker { color: rgba(139,92,246,0.7); font-variant-numeric: tabular-nums; }
.mdv-root li > ul, .mdv-root li > ol { margin: 0; }

.mdv-root input[type="checkbox"] {
  margin-right: 5px;
  accent-color: #8b5cf6;
  cursor: default;
}

.mdv-root blockquote {
  margin: 0.55em 0;
  padding: 0.4em 0.85em;
  border-left: 3px solid rgba(139,92,246,0.5);
  background: rgba(139,92,246,0.06);
  border-radius: 0 6px 6px 0;
  color: var(--color-text-muted, #a1a1aa);
  font-style: italic;
}
.mdv-root blockquote p { margin: 0; }

.mdv-root table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.65em 0;
  font-size: 0.9em;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}
.mdv-root th {
  background: rgba(139,92,246,0.14);
  color: #c084fc;
  font-weight: 600;
  padding: 5px 11px;
  text-align: left;
  font-size: 0.83em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid rgba(139,92,246,0.25);
}
.mdv-root td {
  padding: 4px 11px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  color: var(--color-text-primary, #e4e4e7);
}
.mdv-root tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
.mdv-root tr:last-child td { border-bottom: none; }
.mdv-root tr:hover td { background: rgba(139,92,246,0.06); transition: background 0.1s; }

.mdv-root .mdv-code-block {
  margin: 0.65em 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  background: #0d0d10;
}
.mdv-root .mdv-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: rgba(255,255,255,0.035);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  gap: 8px;
}
.mdv-root .mdv-lang-pill {
  font-size: 9.5px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255,255,255,0.3);
  text-transform: lowercase;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.08);
}
.mdv-root .mdv-copy-btn {
  font-size: 9.5px;
  font-family: inherit;
  color: rgba(139,92,246,0.55);
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  padding: 1px 7px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.mdv-root .mdv-copy-btn:hover {
  background: rgba(139,92,246,0.12);
  border-color: rgba(139,92,246,0.25);
  color: #c084fc;
}
.mdv-root pre {
  margin: 0;
  padding: 10px 13px;
  overflow-x: auto;
  background: transparent !important;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.mdv-root pre code.hljs {
  background: transparent !important;
  padding: 0;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

/* hljs atom-one-dark */
.mdv-root .hljs                                    { color: #abb2bf; }
.mdv-root .hljs-comment, .mdv-root .hljs-quote     { color: #5c6370; font-style: italic; }
.mdv-root .hljs-keyword, .mdv-root .hljs-selector-tag,
.mdv-root .hljs-built_in                           { color: #c678dd; }
.mdv-root .hljs-string, .mdv-root .hljs-regexp,
.mdv-root .hljs-addition, .mdv-root .hljs-attribute{ color: #98c379; }
.mdv-root .hljs-number, .mdv-root .hljs-literal,
.mdv-root .hljs-variable, .mdv-root .hljs-template-variable,
.mdv-root .hljs-meta                               { color: #56b6c2; }
.mdv-root .hljs-title, .mdv-root .hljs-section,
.mdv-root .hljs-name, .mdv-root .hljs-selector-id  { color: #61aeee; }
.mdv-root .hljs-type, .mdv-root .hljs-class .hljs-title,
.mdv-root .hljs-attr                               { color: #e6c07b; }
.mdv-root .hljs-tag, .mdv-root .hljs-deletion,
.mdv-root .hljs-subst                              { color: #e06c75; }
.mdv-root .hljs-link                               { color: #61aeee; text-decoration: underline; }
.mdv-root .hljs-emphasis                           { font-style: italic; }
.mdv-root .hljs-strong                             { font-weight: 700; }
`;

// ─── Style injection ──────────────────────────────────────────────────────────
function ensureMdvStyle() {
  if (_styleInjected || typeof document === 'undefined') return;
  _styleInjected = true;
  const el = document.createElement('style');
  el.id = 'daakia-mdv-css';
  el.textContent = MDV_CSS;
  document.head.appendChild(el);
}

// ─── Marked configuration (once) ─────────────────────────────────────────────
function ensureMarkedConfig() {
  if (_markedConfigured) return;
  _markedConfigured = true;

  const r = new Renderer();

  // Fenced code blocks with header + copy button
  r.code = function({ text, lang }: { text: string; lang?: string }) {
    const safeLang = (lang || 'plaintext').replace(/[<>"'&]/g, '');
    const language = hljs.getLanguage(safeLang) ? safeLang : 'plaintext';
    let highlighted = text;
    try { highlighted = hljs.highlight(text, { language }).value; } catch(_e) { /* noop */ }
    const encoded = encodeURIComponent(text);
    return [
      '<div class="mdv-code-block">',
        '<div class="mdv-code-header">',
          '<span class="mdv-lang-pill">' + safeLang + '</span>',
          '<button class="mdv-copy-btn" data-code="' + encoded + '">Copy</button>',
        '</div>',
        '<pre><code class="hljs language-' + language + '">' + highlighted + '</code></pre>',
      '</div>',
    ].join('');
  };

  // Inline code
  r.codespan = function({ text }: { text: string }) {
    return '<code class="mdv-inline-code">' + text + '</code>';
  };

  marked.use({
    renderer: r,
    breaks: true,
    gfm: true,
  });
}

// ─── Parse helper ─────────────────────────────────────────────────────────────
function parseMarkdown(content: string): string {
  ensureMarkedConfig();
  try {
    const result = marked.parse(content);
    return typeof result === 'string' ? result : content;
  } catch(_e) {
    const escaped = String(content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<p>' + escaped + '</p>';
  }
}

// ─── Copy-button wiring ──────────────────────────────────────────────────────
function wireCopyButtons(root: HTMLElement) {
  root.querySelectorAll('.mdv-copy-btn:not([data-wired])').forEach(btn => {
    const htmlBtn = btn as HTMLButtonElement;
    htmlBtn.dataset.wired = '1';
    htmlBtn.addEventListener('click', () => {
      const code = decodeURIComponent(htmlBtn.dataset.code || '');
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
      const orig = htmlBtn.textContent || 'Copy';
      htmlBtn.textContent = '✓ Copied';
      setTimeout(() => { htmlBtn.textContent = orig; }, 2000);
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render markdown content into an HTML element.
 * @param markdown - Raw markdown string
 * @param container - Container element to render into
 */
function MdRender(markdown: string, container: HTMLElement) {
  ensureMdvStyle();
  const html = parseMarkdown(markdown);
  container.innerHTML = html;
  container.classList.add('mdv-root');
  wireCopyButtons(container);
}

// Export to global scope
(window as any).MdRender = MdRender;
