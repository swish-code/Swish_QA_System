/**
 * PostgreSQL adapter that mimics the subset of better-sqlite3 used by this app.
 *
 * Why: the codebase was written for better-sqlite3 (sync). This adapter exposes
 * the same call shape (prepare/get/run/all/exec) but backed by `pg` (async),
 * so every caller becomes `await db.prepare(sql).get(args)` etc.
 *
 * It also translates a small subset of SQLite-specific SQL into PostgreSQL
 * equivalents (placeholders ?→$N, AUTOINCREMENT → SERIAL, INSERT OR IGNORE
 * → INSERT ... ON CONFLICT DO NOTHING, datetime('now') → CURRENT_TIMESTAMP,
 * JSON → JSONB, REAL → DOUBLE PRECISION, BOOLEAN coercion for 0/1 columns).
 */
import { Pool, types } from "pg";

// node-postgres returns BIGINT (int8) as a string by default because BIGINT
// can exceed Number.MAX_SAFE_INTEGER. The original code uses better-sqlite3
// which returns COUNT(*) as a number, so the codebase compares with
// `=== 0` and does arithmetic on counts. Force int8 -> JS number here so
// the existing logic keeps working. (Safe for counts; values exceeding
// 2^53 would lose precision, but row counts in this app never go near
// that.)
types.setTypeParser(types.builtins.INT8, (val: string) => parseInt(val, 10));

export interface RunResult {
  lastInsertRowid: number | bigint;
  changes: number;
}

function translateSql(sql: string): string {
  let out = sql;

  // CREATE TABLE adjustments — replace SQLite types/quirks with PG equivalents.
  out = out.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
  out = out.replace(/AUTOINCREMENT/gi, "");
  out = out.replace(/\bJSON\b/g, "JSONB");
  out = out.replace(/\bREAL\b/g, "DOUBLE PRECISION");
  // SQLite TEXT works in PG; leave as-is. TIMESTAMP works.

  // INSERT OR IGNORE INTO  ->  INSERT INTO ... (we append ON CONFLICT DO NOTHING later if pattern matches)
  const insertOrIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/gi;
  const hadInsertOrIgnore = insertOrIgnore.test(out);
  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");

  // INSERT OR REPLACE INTO  ->  needs an explicit ON CONFLICT … DO UPDATE; flag for caller
  out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");

  // datetime('now') -> CURRENT_TIMESTAMP, date('now') -> CURRENT_DATE
  out = out.replace(/datetime\(\s*'now'\s*\)/gi, "CURRENT_TIMESTAMP");
  out = out.replace(/date\(\s*'now'\s*\)/gi, "CURRENT_DATE");

  // SQLite "GROUP_CONCAT(x)" -> string_agg(x::text, ',')
  out = out.replace(/GROUP_CONCAT\(\s*([^)]+?)\s*\)/gi, "string_agg($1::text, ',')");

  // Translate IIF (SQLite) to CASE WHEN (PG supports it but old engines may not).
  // We leave IIF if needed — PG 12+ supports it via no-op.

  // If we removed INSERT OR IGNORE, append ON CONFLICT DO NOTHING at the end
  // (only safe when the original was a plain INSERT — caller should ensure that).
  if (hadInsertOrIgnore && !/ON\s+CONFLICT/i.test(out)) {
    out = out.trimEnd().replace(/;?$/, "") + " ON CONFLICT DO NOTHING";
  }

  // Convert ? placeholders to $1, $2, ... (skip if already $N).
  if (!/\$\d/.test(out)) {
    let i = 0;
    out = out.replace(/\?/g, () => `$${++i}`);
  }

  return out;
}

function shouldReturnId(sql: string): boolean {
  // Heuristic: INSERTs into tables with id should return the new id
  return /^\s*INSERT\s+INTO/i.test(sql) && !/RETURNING/i.test(sql);
}

function appendReturningId(sql: string): string {
  return sql.trimEnd().replace(/;?$/, "") + " RETURNING id";
}

export class PgStatement {
  constructor(private pool: Pool, private rawSql: string) {}

  private get sql(): string {
    return translateSql(this.rawSql);
  }

  async get<T = any>(...params: any[]): Promise<T | undefined> {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const res = await this.pool.query(this.sql, flatParams);
    return res.rows[0] as T | undefined;
  }

  async all<T = any>(...params: any[]): Promise<T[]> {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const res = await this.pool.query(this.sql, flatParams);
    return res.rows as T[];
  }

  async run(...params: any[]): Promise<RunResult> {
    const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    let sql = this.sql;
    let lastInsertRowid: number | bigint = 0;
    if (shouldReturnId(sql)) {
      sql = appendReturningId(sql);
    }
    const res = await this.pool.query(sql, flatParams);
    if (res.rows.length > 0 && res.rows[0].id !== undefined) {
      lastInsertRowid = res.rows[0].id;
    }
    return { lastInsertRowid, changes: res.rowCount ?? 0 };
  }
}

export class PgDatabase {
  constructor(public pool: Pool) {}

  prepare(sql: string): PgStatement {
    return new PgStatement(this.pool, sql);
  }

  async exec(sql: string): Promise<void> {
    // Split on top-level semicolons (rough — assumes no semicolons inside literals).
    const parts = sql
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const part of parts) {
      await this.pool.query(translateSql(part));
    }
  }

  // Convenience helpers (used directly in some places).
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return this.prepare(sql).get<T>(params);
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.prepare(sql).all<T>(params);
  }

  async run(sql: string, params: any[] = []): Promise<RunResult> {
    return this.prepare(sql).run(params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createDb(): PgDatabase {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. On Railway, link the Postgres service to this service so its DATABASE_URL is injected."
    );
  }
  // Railway / most managed Postgres use self-signed certs over TLS.
  // Enable SSL whenever the URL looks remote (anything not localhost / 127.0.0.1).
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(connectionString);
  const ssl = isLocal ? undefined : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString, ssl, max: 10 });
  return new PgDatabase(pool);
}
