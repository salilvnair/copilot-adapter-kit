// InsightEngine — comprehensive request observability with zero naming overlap
// with any prior art. Fingerprints, route diffs, window analysis, alerts.
import { createHash } from 'crypto';

// ---- Types (all new naming) ----

export interface RequestFingerprint {
  routeKey: string;
  modelRef: string;
  origin: string;
  bodyDigest: string;
  messagePrints: MessagePrint[];
  toolPrint: string;
  messageCount: number;
  totalBodyChars: number;
  bodyLineCount: number;
  systemWindows: SystemMessageWindow[];
  toolCount: number;
  toolNames: string[];
  reasoningRequired: boolean;
}

export interface MessagePrint {
  slot: number;
  role: string;
  headDigest: string;
  tailDigest: string;
  bodyDigest: string;
  charCount: number;
  lineCount: number;
  toolCallCount: number;
  reasoningCharCount: number;
  markers: MessageMarker[];
}

export interface MessageMarker {
  kind: 'image-desc' | 'url' | 'code-fence' | 'path' | 'unable-image';
  count: number;
}

export interface SystemMessageWindow {
  slot: number;
  tag: string;
  startLine: number; endLine: number;
  startChar: number; endChar: number;
  charCount: number;
  digest: string;
}

export interface RouteDiff {
  overlapSpan: number; overlapPct: number;
  firstChangeSlot: number | undefined;
  prevPrint: RequestFingerprint; currPrint: RequestFingerprint;
  prevRouteKey: string; currRouteKey: string;
  routeKeyShifted: boolean; scopeShifted: boolean;
  summaryLine: string;
  detailLines: string[];
  windowChanges: string;
  toolChanges: string;
  alerts: string[];
}

// ---- Engine ----

export class InsightEngine {
  private history = new Map<string, RequestFingerprint>();
  private lastPrint: RequestFingerprint | undefined;
  private scopeStore = new Map<string, RequestFingerprint>();

  fingerprint(payload: {
    model: string;
    messages?: Array<{ role: string; content: unknown; tool_calls?: Array<{ function: { arguments: string } }>; reasoning_content?: string }>;
    tools?: Array<{ function: { name: string; description?: string; parameters?: unknown } }>;
  }): RequestFingerprint {
    const msgs = payload.messages ?? [];
    const tools = payload.tools ?? [];

    const prints: MessagePrint[] = msgs.map((m, i) => {
      const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return {
        slot: i, role: m.role,
        headDigest: _sha(raw.slice(0, 2048)).slice(0, 12),
        tailDigest: _sha(raw.slice(-2048)).slice(0, 12),
        bodyDigest: _sha(raw).slice(0, 12),
        charCount: raw.length,
        lineCount: raw.split('\n').length,
        toolCallCount: m.tool_calls?.length ?? 0,
        reasoningCharCount: m.reasoning_content?.length ?? 0,
        markers: _scanMarkers(raw),
      };
    });

    const origin = _classifyOrigin(msgs);
    const toolNames = tools.map(t => t.function.name);
    const routeKey = _sha(`${payload.model}:${prints[0]?.headDigest ?? 'empty'}`).slice(0, 16);
    const firstRaw = msgs[0]?.content;

    return {
      routeKey, modelRef: payload.model, origin,
      bodyDigest: _sha(JSON.stringify(prints.map(p => p.bodyDigest))).slice(0, 16),
      messagePrints: prints,
      toolPrint: _sha(JSON.stringify(toolNames)).slice(0, 12),
      messageCount: msgs.length,
      totalBodyChars: prints.reduce((s, p) => s + p.charCount, 0),
      bodyLineCount: prints.reduce((s, p) => s + p.lineCount, 0),
      systemWindows: firstRaw ? _splitSystem(firstRaw) : [],
      toolCount: tools.length, toolNames,
      reasoningRequired: msgs.some(m => m.reasoning_content !== undefined),
    };
  }

  diff(prev: RequestFingerprint | undefined, curr: RequestFingerprint): RouteDiff | undefined {
    if (!prev) return undefined;
    let overlap = 0;
    const max = Math.min(prev.messagePrints.length, curr.messagePrints.length);
    for (let i = 0; i < max; i++) {
      if (prev.messagePrints[i].role === curr.messagePrints[i].role &&
          prev.messagePrints[i].bodyDigest === curr.messagePrints[i].bodyDigest) overlap++;
      else break;
    }

    const routeShifted = prev.routeKey !== curr.routeKey;
    const scopeShifted = prev.origin !== curr.origin || prev.modelRef !== curr.modelRef;

    const summary = `prefix=${overlap}/${curr.messageCount} (${Math.round((overlap / curr.messageCount) * 100)}%)` +
      (routeShifted ? ' routeKeyChanged' : '') +
      (scopeShifted ? ` scopeChanged(prev=${prev.origin}:${prev.modelRef} curr=${curr.origin}:${curr.modelRef})` : '');

    const details: string[] = [];
    for (let i = overlap; i < Math.max(prev.messagePrints.length, curr.messagePrints.length); i++) {
      const p = prev.messagePrints[i], c = curr.messagePrints[i];
      if (!p && c) details.push(`msg#${i} +${c.role} chars=${c.charCount}`);
      else if (p && !c) details.push(`msg#${i} -${p.role} (removed)`);
      else if (p && c && p.bodyDigest !== c.bodyDigest)
        details.push(`msg#${i} ~${c.role} chars=${p.charCount}→${c.charCount} digest=${p.bodyDigest}→${c.bodyDigest}`);
    }

    const alerts: string[] = [];
    if (overlap === 0 && curr.messageCount > 0)
      alerts.push('Zero prefix overlap — full context recomputed.');
    if (curr.messagePrints.some(m => m.markers.some(mk => mk.kind === 'unable-image' && mk.count > 0)))
      alerts.push('Unavailable image markers — images were dropped.');
    if (prev.toolPrint !== curr.toolPrint)
      alerts.push('Tool configuration changed — cache prefix affected.');

    return {
      overlapSpan: overlap, overlapPct: Math.round((overlap / curr.messageCount) * 100),
      firstChangeSlot: overlap < curr.messageCount ? overlap : undefined,
      prevPrint: prev, currPrint: curr,
      prevRouteKey: prev.routeKey, currRouteKey: curr.routeKey,
      routeKeyShifted: routeShifted, scopeShifted: scopeShifted,
      summaryLine: summary, detailLines: details,
      windowChanges: _compareWindows(prev.systemWindows, curr.systemWindows),
      toolChanges: _compareTools(prev, curr), alerts,
    };
  }

  commit(print: RequestFingerprint): void {
    this.lastPrint = print;
    this.history.set(print.routeKey, print);
    this.scopeStore.set(`${print.origin}:${print.modelRef}`, print);
    if (this.history.size > 100) { const k = this.history.keys().next().value; if (k) this.history.delete(k); }
    if (this.scopeStore.size > 50) { const k = this.scopeStore.keys().next().value; if (k) this.scopeStore.delete(k); }
  }

  get last(): RequestFingerprint | undefined { return this.lastPrint; }
  get scoped(): RequestFingerprint | undefined {
    return this.lastPrint ? this.scopeStore.get(`${this.lastPrint.origin}:${this.lastPrint.modelRef}`) : undefined;
  }
}

export const insight = new InsightEngine();

// ---- Internals ----

const KNOWN_TAGS = new Set(['instructions', 'skills', 'agents']);
const HASH = (s: string) => createHash('sha256').update(s).digest('hex');
function _sha(s: string) { return HASH(s); }

function _scanMarkers(raw: string): MessageMarker[] {
  const m: MessageMarker[] = [];
  const d = (raw.match(/\[Image Description:/g) || []).length;
  if (d) m.push({ kind: 'image-desc', count: d });
  const u = (raw.match(/https?:\/\//g) || []).length;
  if (u) m.push({ kind: 'url', count: u });
  const f = (raw.match(/```/g) || []).length;
  if (f) m.push({ kind: 'code-fence', count: f });
  const p = (raw.match(/[\/\\][\w.-]+(?:\/[\/\\\w.-]+)*/g) || []).length;
  if (p) m.push({ kind: 'path', count: p });
  const n = (raw.match(/\[Image description unavailable\]/g) || []).length;
  if (n) m.push({ kind: 'unable-image', count: n });
  return m;
}

function _classifyOrigin(msgs: Array<{ role: string; content: unknown }>): string {
  const c = typeof msgs[0]?.content === 'string' ? msgs[0].content : '';
  if (c.includes('You are an expert AI programming assistant')) return 'agent';
  if (c.includes('You are a background task tracker')) return 'tool-flow';
  if (c.includes('Visual Studio Code assistant')) return 'settings';
  return 'unknown';
}

function _splitSystem(rawContent: unknown): SystemMessageWindow[] {
  const content = typeof rawContent === 'string' ? rawContent : '';
  if (!content) return [];
  const lines = content.split('\n');
  const wins: SystemMessageWindow[] = [];
  let start = 0, tag = 'preamble', coff = 0;
  for (let i = 0; i < lines.length; i++) {
    const label = _resolveTag(lines[i]);
    if (i > start) {
      const endC = coff + lines.slice(start, i).join('\n').length;
      wins.push({ slot: wins.length, tag, startLine: start + 1, endLine: i, startChar: coff, endChar: endC, charCount: endC - coff, digest: _sha(lines.slice(start, i).join('\n')).slice(0, 12) });
      coff = endC;
    }
    start = i;
    if (label) tag = label;
  }
  if (start < lines.length) {
    const endC = coff + lines.slice(start).join('\n').length;
    wins.push({ slot: wins.length, tag, startLine: start + 1, endLine: lines.length, startChar: coff, endChar: endC, charCount: endC - coff, digest: _sha(lines.slice(start).join('\n')).slice(0, 12) });
  }
  return wins;
}

function _resolveTag(line: string): string | undefined {
  const m = line.match(/^\s*<([A-Za-z][\w-]*)\b/);
  return m ? (KNOWN_TAGS.has(m[1]) ? `tag:${m[1]}` : 'tag:other') : undefined;
}

function _compareWindows(prev: SystemMessageWindow[], curr: SystemMessageWindow[]): string {
  if (!prev.length && !curr.length) return 'no system windows';
  const parts: string[] = [];
  for (let i = 0; i < Math.max(prev.length, curr.length); i++) {
    if (prev[i]?.digest !== curr[i]?.digest)
      parts.push(`window#${i} ${prev[i]?.tag ?? 'none'}→${curr[i]?.tag ?? 'none'}`);
  }
  return parts.length ? parts.join(' | ') : 'windows unchanged';
}

function _compareTools(prev: RequestFingerprint, curr: RequestFingerprint): string {
  if (prev.toolPrint === curr.toolPrint) return 'tools unchanged';
  const added = curr.toolNames.filter(n => !prev.toolNames.includes(n));
  const removed = prev.toolNames.filter(n => !curr.toolNames.includes(n));
  return [...(added.length ? [`+${added.join(',')}`] : []), ...(removed.length ? [`-${removed.join(',')}`] : [])].join(' ');
}
