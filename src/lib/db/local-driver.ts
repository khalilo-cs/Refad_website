

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type LocalDatabase = Database.Database;

export function openLocalDatabase(): LocalDatabase {
  const dir = process.env.SQLITE_DIR ?? process.cwd();
  const file = process.env.DATABASE_FILE ?? "dev.db";
  const dbPath = path.resolve(dir, file);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return db;
}
