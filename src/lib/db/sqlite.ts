/**
 * طبقة الوصول إلى قاعدة بيانات منصة إتقان.
 *
 * محرّكان بواجهة واحدة غير متزامنة:
 *   - SQLite محلي عبر better-sqlite3 (خادم عادي أو Docker بقرص دائم).
 *   - libSQL / Turso عند ضبط TURSO_DATABASE_URL (منصات بلا قرص دائم مثل Vercel).
 *
 * كل الاستعلامات معاملاتها مُمرَّرة كمعاملات مربوطة (?) ولا تُدمج في نص SQL.
 */

import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { LocalDatabase } from "./local-driver";
import { runMigrations, type MigrationRunner } from "./migrations";
import { SCHEMA_SQL } from "./schema.generated";

export type ExecResult = { changes: number; lastInsertId: string | number | null };

export function uuid(): string {
  return randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T = unknown>(text: string | null): T | null {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* اختيار المحرّك                                                      */
/* ------------------------------------------------------------------ */

export function isRemoteDb(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim());
}

export function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

export const DB_NOT_CONFIGURED_MESSAGE =
  "قاعدة البيانات غير مهيّأة على هذه الاستضافة. اضبط TURSO_DATABASE_URL و TURSO_AUTH_TOKEN في إعدادات البيئة ثم أعد النشر.";

export class DbNotConfiguredError extends Error {
  constructor() {
    super(DB_NOT_CONFIGURED_MESSAGE);
    this.name = "DbNotConfiguredError";
  }
}

export function isDbNotConfigured(error: unknown): boolean {
  return error instanceof DbNotConfiguredError;
}

type RemoteResult = { rows: Record<string, unknown>[]; rowsAffected: number; lastInsertRowid?: number | bigint };
type RemoteConnection = { execute(q: { sql: string; args: unknown[] }): Promise<RemoteResult> };
type RemoteTx = RemoteConnection & { commit(): Promise<unknown>; rollback(): Promise<unknown> };
type RemoteClient = RemoteConnection & {
  executeMultiple?: (sql: string) => Promise<unknown>;
  batch?: (statements: { sql: string; args: unknown[] }[], mode?: string) => Promise<unknown>;
  transaction(mode?: string): Promise<RemoteTx>;
  close(): void;
};

/** سياق المعاملة الجارية: اتصال المعاملة البعيدة، أو علامة المعاملة المحلية. */
const txContext = new AsyncLocalStorage<{ remote?: RemoteConnection; local?: true }>();

let localDb: LocalDatabase | null = null;
let localReady: Promise<LocalDatabase> | null = null;
let remoteReady: Promise<RemoteClient> | null = null;

function normalizeParams(params: unknown[]): unknown[] {
  return params.map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    return v;
  });
}

function localRunner(db: LocalDatabase): MigrationRunner {
  return {
    all: async <T>(sql: string) => db.prepare(sql).all() as T[],
    script: async (sql: string) => {
      db.exec(sql);
    },
    inTransaction: async (fn) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function remoteRunner(client: RemoteClient): MigrationRunner {
  const script = async (sql: string) => {
    if (client.executeMultiple) await client.executeMultiple(sql);
    else for (const s of splitStatements(sql)) await client.execute({ sql: s, args: [] });
  };
  return {
    all: async <T>(sql: string) => (await client.execute({ sql, args: [] })).rows as unknown as T[],
    script,
    // ALTER TABLE في libSQL لا يُلفّ بمعاملة تفاعلية بأمان؛ تُنفَّذ الجمل بالترتيب.
    inTransaction: async (fn) => fn(),
  };
}

async function local(): Promise<LocalDatabase> {
  if (localDb) return localDb;
  if (!localReady) {
    localReady = (async () => {
      if (isServerlessRuntime()) throw new DbNotConfiguredError();
      const { openLocalDatabase } = await import("./local-driver");
      const db = openLocalDatabase();
      await runMigrations(localRunner(db));
      localDb = db;
      return db;
    })();
    localReady.catch(() => {
      localReady = null;
    });
  }
  return localReady;
}

async function remote(): Promise<RemoteClient> {
  if (!remoteReady) {
    remoteReady = (async () => {
      const { createClient } = await import("@libsql/client");
      const client = createClient({
        url: process.env.TURSO_DATABASE_URL!.trim(),
        authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      }) as unknown as RemoteClient;
      await client.execute({ sql: "PRAGMA foreign_keys = ON", args: [] }).catch(() => undefined);
      await runMigrations(remoteRunner(client));
      return client;
    })();
    remoteReady.catch(() => {
      remoteReady = null;
    });
  }
  return remoteReady;
}

/* ------------------------------------------------------------------ */
/* قفل المعاملات المحلية                                                */
/* ------------------------------------------------------------------ */
/*
 * better-sqlite3 اتصال واحد مشترك. أثناء معاملة غير متزامنة قد يتخلّل طلبٌ آخر
 * بين خطوات await، فتدخل كتابته في المعاملة الجارية. لذلك تنتظر الاستعلامات
 * الواقعة خارج سياق المعاملة حتى تنتهي المعاملة الجارية.
 */
let localTxTail: Promise<void> = Promise.resolve();

async function waitLocalTurn(): Promise<void> {
  if (txContext.getStore()?.local) return;
  await localTxTail;
}

function isBusy(e: unknown): boolean {
  const code = (e as { code?: string; rawCode?: number })?.code;
  return code === "SQLITE_BUSY" || (e as { rawCode?: number })?.rawCode === 5 || /database is locked/i.test(String((e as Error)?.message));
}

/** تنفيذ على الاتصال البعيد مع إعادة المحاولة عند انشغال القاعدة بمعاملة أخرى. */
async function remoteExecute(sql: string, params: unknown[]): Promise<RemoteResult> {
  const inTx = txContext.getStore()?.remote;
  if (inTx) return inTx.execute({ sql, args: normalizeParams(params) });
  const client = await remote();
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.execute({ sql, args: normalizeParams(params) });
    } catch (e) {
      if (!isBusy(e) || attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, Math.min(25 * 2 ** attempt, 1000)));
    }
  }
}

/* ------------------------------------------------------------------ */
/* الواجهة العامة                                                      */
/* ------------------------------------------------------------------ */

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isRemoteDb()) {
    const r = await remoteExecute(sql, params);
    return r.rows as unknown as T[];
  }
  const db = await local();
  await waitLocalTurn();
  return db.prepare(sql).all(...normalizeParams(params)) as T[];
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  if (isRemoteDb()) {
    const r = await remoteExecute(sql, params);
    return (r.rows[0] as unknown as T) ?? null;
  }
  const db = await local();
  await waitLocalTurn();
  const row = db.prepare(sql).get(...normalizeParams(params));
  return row ? (row as T) : null;
}

export async function exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
  if (isRemoteDb()) {
    const r = await remoteExecute(sql, params);
    return {
      changes: r.rowsAffected ?? 0,
      lastInsertId: r.lastInsertRowid == null ? null : String(r.lastInsertRowid),
    };
  }
  const db = await local();
  await waitLocalTurn();
  const info = db.prepare(sql).run(...normalizeParams(params));
  return { changes: info.changes, lastInsertId: String(info.lastInsertRowid) };
}

/** تنفيذ نص SQL متعدد الجمل (مخطط أو نسخة احتياطية). */
export async function execScript(sql: string): Promise<void> {
  if (isRemoteDb()) {
    await remoteRunner(await remote()).script(sql);
    return;
  }
  const db = await local();
  await waitLocalTurn();
  db.exec(sql);
}

/** تنفيذ عدة أوامر كتابة دفعة واحدة وبشكل ذري. */
export async function batch(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
  if (!statements.length) return;
  if (isRemoteDb() && !txContext.getStore()) {
    const client = await remote();
    const prepared = statements.map((s) => ({ sql: s.sql, args: normalizeParams(s.params ?? []) }));
    if (client.batch) await client.batch(prepared, "write");
    else for (const s of prepared) await client.execute(s);
    return;
  }
  await transaction(async () => {
    for (const s of statements) await exec(s.sql, s.params ?? []);
  });
}

/**
 * معاملة ذرية: إما أن تُطبَّق كل أوامر fn أو لا شيء منها.
 * المعاملات المتداخلة تنضم إلى المعاملة الخارجية.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txContext.getStore()) return fn();

  if (isRemoteDb()) {
    const client = await remote();
    let tx: RemoteTx;
    for (let attempt = 0; ; attempt++) {
      try {
        tx = await client.transaction("write");
        break;
      } catch (e) {
        if (!isBusy(e) || attempt >= 8) throw e;
        await new Promise((r) => setTimeout(r, Math.min(25 * 2 ** attempt, 1000)));
      }
    }
    try {
      const result = await txContext.run({ remote: tx }, fn);
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback().catch(() => undefined);
      throw e;
    }
  }

  const db = await local();
  const prev = localTxTail;
  let release!: () => void;
  localTxTail = new Promise<void>((r) => (release = r));
  await prev;
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = await txContext.run({ local: true }, fn);
      db.exec("COMMIT");
      return result;
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* المعاملة أُلغيت مسبقاً */
      }
      throw e;
    }
  } finally {
    release();
  }
}

/** دمج ملف WAL في الملف الرئيسي (للمحلي فقط). */
export async function checkpointLocal(): Promise<void> {
  if (isRemoteDb()) return;
  try {
    (await local()).pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* غير حرج */
  }
}

/** مسار ملف قاعدة البيانات المحلية (للنسخ الاحتياطي)، أو null عند استخدام قاعدة بعيدة. */
export async function localDatabaseFile(): Promise<string | null> {
  if (isRemoteDb()) return null;
  return (await local()).name;
}

export async function closeDb(): Promise<void> {
  if (remoteReady) {
    const c = await remoteReady.catch(() => null);
    c?.close();
    remoteReady = null;
  }
  if (localDb) {
    localDb.close();
    localDb = null;
  }
  localReady = null;
  localTxTail = Promise.resolve();
}

/* ------------------------------------------------------------------ */
/* التهيئة                                                             */
/* ------------------------------------------------------------------ */

export async function isInitialized(): Promise<boolean> {
  try {
    return Boolean(await queryOne("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"));
  } catch (e) {
    if (isDbNotConfigured(e)) throw e;
    return false;
  }
}

/** إنشاء المخطط (آمن للتكرار) ثم تطبيق الترحيلات وبذر البيانات المرجعية. */
export async function initDatabase(opts?: { seed?: boolean; demo?: boolean; demoPassword?: string }): Promise<{ demoPassword?: string }> {
  await execScript(SCHEMA_SQL);
  if (isRemoteDb()) await runMigrations(remoteRunner(await remote()));
  else await runMigrations(localRunner(await local()));
  if (opts?.seed) {
    const { seedDatabase } = await import("./seed-sqlite");
    return seedDatabase({ demo: opts.demo, demoPassword: opts.demoPassword });
  }
  return {};
}

let readyPromise: Promise<void> | null = null;

/**
 * يضمن أن القاعدة مهيّأة قبل أول استخدام على الاستضافات التي لا تتيح خطوة
 * تهيئة يدوية. آمن للتكرار: الإنشاء IF NOT EXISTS والبذر لا يكرر السجلات.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (!(await isInitialized())) await initDatabase({ seed: true });
      const { ensureBootstrapAdmin } = await import("./bootstrap-admin");
      await ensureBootstrapAdmin();
    })();
  }
  try {
    await readyPromise;
  } catch (e) {
    readyPromise = null;
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* أدوات                                                               */
/* ------------------------------------------------------------------ */

/** تقسيم نص SQL إلى جُمل مع احترام النصوص المقتبسة وكتل BEGIN…END للمشغّلات. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inS = false;
  let inD = false;
  let depth = 0;
  const lines = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  for (let i = 0; i < lines.length; i++) {
    const ch = lines[i];
    if (ch === "'" && !inD) inS = !inS;
    else if (ch === '"' && !inS) inD = !inD;
    cur += ch;
    if (!inS && !inD) {
      const tail = cur.slice(-6).toUpperCase();
      if (/\bBEGIN$/.test(tail) && /CREATE\s+TRIGGER/i.test(cur)) depth++;
      if (/\bEND$/.test(tail) && depth > 0 && !/[A-Z_]/i.test(lines[i + 1] ?? " ")) depth--;
      if (ch === ";" && depth === 0) {
        const s = cur.trim();
        if (s && s !== ";") out.push(s);
        cur = "";
      }
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString("hex")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** تصدير القاعدة كاملة بصيغة SQL — نسخة احتياطية تعمل مع المحرّكين. */
export async function dumpToSql(): Promise<string> {
  const objects = await query<{ type: string; name: string; sql: string | null }>(
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'
     ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name`
  );
  const lines = ["-- منصة إتقان — نسخة احتياطية", `-- ${nowISO()}`, "PRAGMA foreign_keys = OFF;", "BEGIN TRANSACTION;", ""];
  for (const t of objects.filter((o) => o.type === "table")) {
    lines.push(`DROP TABLE IF EXISTS "${t.name}";`, `${t.sql};`);
    for (const row of await query<Record<string, unknown>>(`SELECT * FROM "${t.name}"`)) {
      const cols = Object.keys(row);
      lines.push(`INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((c) => sqlLiteral(row[c])).join(", ")});`);
    }
    lines.push("");
  }
  for (const o of objects.filter((x) => x.type !== "table")) lines.push(`${o.sql};`);
  lines.push("", "COMMIT;", "PRAGMA foreign_keys = ON;", "");
  return lines.join("\n");
}
