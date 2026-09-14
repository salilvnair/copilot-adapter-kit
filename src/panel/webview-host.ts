// WebviewHost — loads a built webview bundle into a VS Code webview.
//
// The React surfaces are built by webview-ui/ into media/dist/ with a Vite
// manifest. This resolves an entry to its emitted JS/CSS, rewrites them as
// webview URIs, and emits a document with a per-load nonce so the CSP can stay
// strict: no inline script, no remote origins, nothing but our own assets.

import { readFileSync } from 'fs';
import { join } from 'path';
import vscode from 'vscode';

/** Entry names, matching the inputs in webview-ui/vite.config.ts. */
export type WebviewEntry = 'settings' | 'spendGuard' | 'sidebar' | 'harness';

/** The html file each entry was built from, as keyed in the Vite manifest. */
const ENTRY_SOURCE: Record<WebviewEntry, string> = {
  settings: 'settings.html',
  spendGuard: 'spend-guard.html',
  sidebar: 'sidebar.html',
  harness: 'harness.html',
};

interface ManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
  isEntry?: boolean;
}
type Manifest = Record<string, ManifestChunk>;

const DIST = ['media', 'dist'];

export class WebviewHost {
  private manifest: Manifest | undefined;

  constructor(private ext: vscode.ExtensionContext) {}

  /** Directories a webview using this host may load local content from. */
  get localRoots(): vscode.Uri[] {
    return [vscode.Uri.file(join(this.ext.extensionPath, ...DIST))];
  }

  /** Options every CAK webview should be created with. */
  get options(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: this.localRoots,
    };
  }

  /**
   * Full document for `entry`. Throws with an actionable message when the
   * bundle is missing, which in practice means the build was skipped.
   */
  html(webview: vscode.Webview, entry: WebviewEntry): string {
    const manifest = this._manifest();
    const chunk = manifest[ENTRY_SOURCE[entry]];
    if (!chunk) {
      throw new Error(
        `Webview entry "${entry}" is not in the build manifest. Run "npm run build:webview".`,
      );
    }

    const nonce = _nonce();
    const uri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.file(join(this.ext.extensionPath, ...DIST, file)));

    // Vite splits shared code out of the entry; every transitive import has to
    // be preloaded or the module graph 404s at run time.
    const scripts = [...this._imports(manifest, ENTRY_SOURCE[entry]), chunk.file];
    const styles = this._styles(manifest, ENTRY_SOURCE[entry]);

    // script-src needs the resource origin as well as the nonce: the entry is a
    // module, and the chunks it imports (plus their modulepreload links) are
    // fetched by the loader, not parsed from a nonce-carrying tag. With only the
    // nonce, every shared chunk is refused and the panel renders blank.
    // localResourceRoots still bounds what that origin can actually serve.
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `connect-src ${webview.cspSource}`,
    ].join('; ');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
${styles.map(f => `<link rel="stylesheet" href="${uri(f)}">`).join('\n')}
<title>Copilot Adapter Kit</title>
</head>
<body class="dui">
<div id="root"></div>
${scripts
  .slice(0, -1)
  .map(f => `<link rel="modulepreload" nonce="${nonce}" href="${uri(f)}">`)
  .join('\n')}
<script type="module" nonce="${nonce}" src="${uri(chunk.file)}"></script>
</body>
</html>`;
  }

  /** Re-read the manifest. Call after a rebuild during development. */
  invalidate(): void {
    this.manifest = undefined;
  }

  // ---- Internals ----

  private _manifest(): Manifest {
    if (this.manifest) return this.manifest;
    const path = join(this.ext.extensionPath, ...DIST, '.vite', 'manifest.json');
    try {
      this.manifest = JSON.parse(readFileSync(path, 'utf-8')) as Manifest;
    } catch {
      throw new Error(
        'Webview bundle not found. Run "npm run build:webview" (or "npm run compile") and reload.',
      );
    }
    return this.manifest;
  }

  /** Every JS file the entry depends on, deepest first, deduplicated. */
  private _imports(manifest: Manifest, key: string, seen = new Set<string>()): string[] {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return [];
    seen.add(key);
    const out: string[] = [];
    for (const dep of chunk.imports ?? []) {
      out.push(...this._imports(manifest, dep, seen));
      const depChunk = manifest[dep];
      if (depChunk) out.push(depChunk.file);
    }
    return [...new Set(out)];
  }

  /** Stylesheets from the entry and everything it imports. */
  private _styles(manifest: Manifest, key: string, seen = new Set<string>()): string[] {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) return [];
    seen.add(key);
    const out = [...(chunk.css ?? [])];
    for (const dep of chunk.imports ?? []) out.push(...this._styles(manifest, dep, seen));
    return [...new Set(out)];
  }
}

function _nonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
