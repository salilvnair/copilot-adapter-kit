import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

/* Bridge to the extension host, plus theme sync.
 *
 * The mock is dark by default and carries `is-light` for the light palette.
 * VS Code stamps `vscode-light` / `vscode-high-contrast-light` on the body, so
 * we mirror that onto the same class the mock already uses. */

export interface VsCodeApi<S = unknown> {
  postMessage(message: unknown): void;
  getState(): S | undefined;
  setState(state: S): void;
}

declare function acquireVsCodeApi<S = unknown>(): VsCodeApi<S>;

let api: VsCodeApi | undefined;

/** The host API, or undefined when the page is open outside VS Code. */
export function vscode(): VsCodeApi | undefined {
  if (api) return api;
  try {
    api = acquireVsCodeApi();
  } catch {
    api = undefined;
  }
  return api;
}

export function post(type: string, payload?: unknown): void {
  // Dev aid: outside VS Code there is no host to receive this, so mirror it as
  // a DOM event. Lets a browser session confirm a control is actually wired.
  if (import.meta.env.DEV) {
    window.dispatchEvent(new CustomEvent('cak:post', { detail: { type, payload } }));
  }
  vscode()?.postMessage({ type, payload });
}

/** Subscribe to messages from the extension host. Returns an unsubscribe. */
export function onMessage(handler: (msg: { type: string; payload?: unknown }) => void): () => void {
  const listener = (e: MessageEvent) => {
    const data = e.data;
    if (data && typeof data.type === 'string') handler(data);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/* ── Theme ────────────────────────────────────────────────────────────── */

export type ThemeMode = 'auto' | 'light' | 'dark';

const THEME_KEY = 'cak.themeMode';
let mode: ThemeMode = 'auto';
const watchers = new Set<(m: ThemeMode) => void>();

function editorIsLight(): boolean {
  return document.body.classList.contains('vscode-light')
    || document.body.classList.contains('vscode-high-contrast-light');
}

function paint(): void {
  const light = mode === 'auto' ? editorIsLight() : mode === 'light';

  // The class goes on the root element as well as the body. dui declares
  // aliases such as `--color-btn-secondary-bg: var(--color-surface-hover)` on
  // :root, and a custom property resolves where it is declared — with the class
  // only on <body> those aliases kept their dark values on a light panel.
  for (const el of [document.documentElement, document.body]) {
    el.classList.toggle('is-light', light);
    el.classList.toggle('vscode-light', light);
  }
  if (!light) {
    document.documentElement.classList.remove('vscode-light');
    // Leave the editor's own class on <body> alone when following it.
    if (mode === 'dark') document.body.classList.remove('vscode-light');
  }
}

/** The current preference: follow the editor, or an explicit choice. */
export function themeMode(): ThemeMode {
  return mode;
}

/** Set the preference, apply it, and remember it for next time. */
export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try {
    const api = vscode();
    api?.setState({ ...(api.getState() as Record<string, unknown> ?? {}), [THEME_KEY]: next });
  } catch { /* no host, or state unavailable */ }
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
  paint();
  for (const w of watchers) w(next);
}

export function onThemeMode(fn: (m: ThemeMode) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

/** Keep the theme in step with the editor. Call once at boot. */
export function syncTheme(): void {
  const stored = (() => {
    try {
      const fromHost = (vscode()?.getState() as Record<string, unknown> | undefined)?.[THEME_KEY];
      if (fromHost === 'light' || fromHost === 'dark' || fromHost === 'auto') return fromHost;
      const fromLocal = localStorage.getItem(THEME_KEY);
      if (fromLocal === 'light' || fromLocal === 'dark' || fromLocal === 'auto') return fromLocal;
    } catch { /* fall through */ }
    return 'auto' as const;
  })();
  mode = stored;
  paint();

  // While following the editor, react to it changing.
  new MutationObserver(() => { if (mode === 'auto') paint(); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

/** Mount helper shared by every entry.
 *
 * react-dom is imported statically on purpose: a dynamic import would emit an
 * extra chunk the webview has to fetch after boot, for no benefit here. */
export function boot(node: ReactNode): void {
  syncTheme();
  const root = document.getElementById('root');
  if (!root) throw new Error('#root missing');
  createRoot(root).render(node);
}
