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

/** Keep `is-light` in step with the editor theme. Call once at boot. */
export function syncTheme(): void {
  const apply = () => {
    const light = document.body.classList.contains('vscode-light')
      || document.body.classList.contains('vscode-high-contrast-light');
    document.body.classList.toggle('is-light', light);
  };
  apply();
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
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
