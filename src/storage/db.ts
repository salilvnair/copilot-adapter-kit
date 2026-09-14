/**
 * SQLite storage for Copilot Adapter Kit — powered by sql.js (WASM).
 * Zero native compilation required. Same SQL, portable across all platforms.
 * Graceful degradation if init fails: the extension keeps working, the audit
 * log simply records nothing and says so.
 *
 * Ported from daakia's storage layer, same shape and the same two tables:
 * `cak_audit` for model calls, `ui_audit` for what was clicked.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import vscode from 'vscode';

type SqlJsDatabase = import('sql.js').Database;

// Module state
let _db: SqlJsDatabase | null = null;
let _sqliteOk = false;
let _sqliteError: string | undefined;
let _dbPath = '';
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// ────────────────────── Initialization ──────────────────────

export async function initDb(extensionPath: string): Promise<void> {
  const configured = vscode.workspace.getConfiguration('copilot-adapter-kit')
    .get<string>('audit.dbPath')?.trim() || process.env.CAK_TEST_DB_PATH || '';
  _dbPath = configured
    || path.join(os.homedir(), '.salilvnair', 'copilot-adapter-kit', 'db', 'cak.db');

  try {
    fs.mkdirSync(path.dirname(_dbPath), { recursive: true });

    // Load sql.js with the WASM binary from the extension's dist folder, put
    // there by esbuild.js. The loader itself is bundled into dist/extension.js.
    const wasmPath = path.join(extensionPath, 'dist', 'sql-wasm.wasm');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js') as typeof import('sql.js').default;

    const SQL = await initSqlJs({ locateFile: () => wasmPath });

    if (fs.existsSync(_dbPath)) {
      _db = new SQL.Database(fs.readFileSync(_dbPath));
    } else {
      _db = new SQL.Database();
    }

    _db.run('PRAGMA journal_mode = WAL');
    _db.run('PRAGMA busy_timeout = 5000');
    _db.run('PRAGMA synchronous = NORMAL');
    _db.run('PRAGMA foreign_keys = ON');

    _schema(_db);
    _sqliteOk = true;
    _save();
  } catch (e) {
    _sqliteOk = false;
    _sqliteError = (e as Error).message;
    _db = null;
  }
}

function _schema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS cak_audit (
      audit_id         INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id  TEXT    NOT NULL,
      stage            TEXT    NOT NULL,
      provider         TEXT,
      model            TEXT,
      system_prompt    TEXT,
      user_prompt      TEXT,
      request_payload  TEXT,
      response_payload TEXT,
      headers          TEXT,
      meta             TEXT,
      input_tokens     INTEGER,
      output_tokens    INTEGER,
      cost_usd         REAL,
      duration_ms      INTEGER,
      error            TEXT,
      created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_conv  ON cak_audit(conversation_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_stage ON cak_audit(stage)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_time  ON cak_audit(created_at DESC)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS ui_audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT    NOT NULL,
      module     TEXT    NOT NULL,
      button     TEXT,
      action     TEXT,
      metadata   TEXT,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ui_audit_event  ON ui_audit(event_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ui_audit_module ON ui_audit(module)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ui_audit_time   ON ui_audit(created_at DESC)`);
}

export function dbStatus(): { ok: boolean; path: string; error?: string; sizeBytes?: number } {
  let sizeBytes: number | undefined;
  try { sizeBytes = fs.statSync(_dbPath).size; } catch { /* not written yet */ }
  return { ok: _sqliteOk, path: _dbPath, error: _sqliteError, sizeBytes };
}

/** Writes are batched: a streaming run would otherwise hit the disk per token. */
function _scheduleSave(): void {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => { _saveTimer = null; _save(); }, 1500);
  _saveTimer.unref?.();
}

function _save(): void {
  if (!_db) return;
  try {
    fs.writeFileSync(_dbPath, Buffer.from(_db.export()));
  } catch (e) {
    _sqliteError = (e as Error).message;
  }
}

/** Flush anything pending. Call on deactivate. */
export function closeDb(): void {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  _save();
  try { _db?.close(); } catch { /* already gone */ }
  _db = null;
}

// ────────────────────── Audit ──────────────────────

export interface CakAuditEntry {
  audit_id?: number;
  conversation_id: string;
  stage: string;
  provider?: string;
  model?: string;
  system_prompt?: string;
  user_prompt?: string;
  request_payload?: string;
  response_payload?: string;
  headers?: string;
  meta?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
  error?: string;
  created_at?: string;
}

export function insertAudit(entry: CakAuditEntry): void {
  if (!_db) return;
  _db.run(`
    INSERT INTO cak_audit (conversation_id, stage, provider, model, system_prompt, user_prompt,
      request_payload, response_payload, headers, meta, input_tokens, output_tokens, cost_usd,
      duration_ms, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    entry.conversation_id,
    entry.stage,
    entry.provider ?? null,
    entry.model ?? null,
    entry.system_prompt ?? null,
    entry.user_prompt ?? null,
    entry.request_payload ?? null,
    entry.response_payload ?? null,
    entry.headers ?? null,
    entry.meta ?? null,
    entry.input_tokens ?? null,
    entry.output_tokens ?? null,
    entry.cost_usd ?? null,
    entry.duration_ms ?? null,
    entry.error ?? null,
  ]);
  _scheduleSave();
}

export function getAuditEntries(limit = 200): CakAuditEntry[] {
  if (!_db) return [];
  const stmt = _db.prepare('SELECT * FROM cak_audit ORDER BY created_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: CakAuditEntry[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as CakAuditEntry);
  stmt.free();
  return rows;
}

export function deleteAuditEntry(auditId: number): void {
  if (!_db) return;
  _db.run('DELETE FROM cak_audit WHERE audit_id = ?', [auditId]);
  _scheduleSave();
}

export function clearAuditEntries(): void {
  if (!_db) return;
  _db.run('DELETE FROM cak_audit');
  _scheduleSave();
}

/** Drop anything older than `days`, so the file cannot grow without bound. */
export function pruneAudit(days: number): number {
  if (!_db || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const before = _count('cak_audit');
  _db.run('DELETE FROM cak_audit WHERE created_at < ?', [cutoff]);
  _db.run('DELETE FROM ui_audit WHERE created_at < ?', [cutoff]);
  _scheduleSave();
  return before - _count('cak_audit');
}

function _count(table: string): number {
  if (!_db) return 0;
  const stmt = _db.prepare(`SELECT COUNT(*) AS n FROM ${table}`);
  stmt.step();
  const n = Number((stmt.getAsObject() as { n?: number }).n ?? 0);
  stmt.free();
  return n;
}

// ────────────────────── UI Audit ──────────────────────

export interface UiAuditEntry {
  id: number;
  event_type: string;
  module: string;
  button?: string;
  action?: string;
  metadata?: string;
  created_at: string;
}

export function insertUiAudit(entry: Omit<UiAuditEntry, 'id' | 'created_at'>): void {
  if (!isUiAuditEnabled(entry.event_type)) return;
  if (!_db) return;
  _db.run(
    'INSERT INTO ui_audit (event_type, module, button, action, metadata) VALUES (?, ?, ?, ?, ?)',
    [entry.event_type, entry.module, entry.button ?? null, entry.action ?? null, entry.metadata ?? null],
  );
  _scheduleSave();
}

export function getUiAuditEntries(limit = 200): UiAuditEntry[] {
  if (!_db) return [];
  const stmt = _db.prepare('SELECT * FROM ui_audit ORDER BY created_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: UiAuditEntry[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as UiAuditEntry);
  stmt.free();
  return rows;
}

export function clearUiAuditEntries(): void {
  if (!_db) return;
  _db.run('DELETE FROM ui_audit');
  _scheduleSave();
}

export function auditCounts(): { ai: number; ui: number } {
  return { ai: _count('cak_audit'), ui: _count('ui_audit') };
}

/* ── DB Explorer ──────────────────────────────────────────────────────────
 *
 * Browsing the database the extension keeps about you, from inside the
 * extension. Read-mostly: list the tables, page through rows, and delete a
 * single row. There is no query box on purpose — arbitrary SQL against your own
 * audit store is a footgun with no upside here.
 */

export interface TableInfo { name: string; rowCount: number; columns: string[] }

/** Every user table, with its columns and how many rows it holds. */
export function listTables(): TableInfo[] {
  if (!_db) return [];
  const out: TableInfo[] = [];
  const names = _db.exec(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  );
  for (const name of names[0]?.values.map(v => String(v[0])) ?? []) {
    out.push({ name, rowCount: _count(name), columns: _columnsOf(name) });
  }
  return out;
}

function _columnsOf(table: string): string[] {
  if (!_db) return [];
  // PRAGMA cannot be parameterised; the name comes from sqlite_master, not input.
  const res = _db.exec(`PRAGMA table_info(${_ident(table)})`);
  return res[0]?.values.map(v => String(v[1])) ?? [];
}

/** A page of rows, newest first where the table records a time. */
export function getTableRows(table: string, limit = 200): Record<string, unknown>[] {
  if (!_db || !_isKnownTable(table)) return [];
  const cols = _columnsOf(table);
  const order = cols.includes('created_at') ? ' ORDER BY created_at DESC' : '';
  const stmt = _db.prepare(`SELECT * FROM ${_ident(table)}${order} LIMIT ?`);
  stmt.bind([limit]);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  return rows;
}

/** Delete one row by its key. Returns whether anything was removed. */
export function deleteTableRow(table: string, pkCol: string, pkVal: unknown): boolean {
  if (!_db || !_isKnownTable(table)) return false;
  if (!_columnsOf(table).includes(pkCol)) return false;   // never an arbitrary column
  _db.run(`DELETE FROM ${_ident(table)} WHERE ${_ident(pkCol)} = ?`, [pkVal as never]);
  _scheduleSave();
  return true;
}

/** Only tables that exist may be addressed, whatever the webview sends. */
function _isKnownTable(table: string): boolean {
  if (!_db) return false;
  const res = _db.exec(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, [table] as never,
  );
  return (res[0]?.values.length ?? 0) > 0;
}

/** Quote an identifier so a name can never be read as SQL. */
function _ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/* ── Audit config ─────────────────────────────────────────────────────────
 *
 * Which UI events are worth a row. The switches live in the panel (Developer
 * Tools → Audit Config) and are mirrored here, because most rows are written by
 * the host rather than the webview: without this, turning an event off would
 * quieten the screen while the database kept filling up.
 *
 * Unknown ids are recorded. An event nobody has classified yet is exactly the
 * one worth seeing, and silence is the wrong default for an audit log.
 */
let _uiAuditConfig: Record<string, boolean> = {};

export function setUiAuditConfig(enabled: Record<string, boolean>): void {
  _uiAuditConfig = enabled && typeof enabled === 'object' ? enabled : {};
}

export function isUiAuditEnabled(eventType: string): boolean {
  return _uiAuditConfig[eventType] !== false;
}
