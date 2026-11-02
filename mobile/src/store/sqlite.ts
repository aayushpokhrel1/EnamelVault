import * as SQLite from "expo-sqlite";
import type { Row, Store, TableName } from "../../../src/mobile/store/types";
import { SCHEMA } from "../../../src/mobile/store/types";

// SQLite stores five types and none of them is an object or a boolean, so the schema's
// column types are not decoration: they say how each value crosses the boundary. `json`
// columns are stringified here and parsed on the way back, which is why the core stores the
// payload as an object and never as a string.
const JSON_COLUMNS = new Map<TableName, string[]>(
  SCHEMA.map((table) => [
    table.name,
    Object.entries(table.columns).filter(([, type]) => type === "json").map(([column]) => column),
  ]),
);

const COLUMNS = new Map<TableName, string[]>(SCHEMA.map((table) => [table.name, Object.keys(table.columns)]));

const sqlType = (type: "text" | "integer" | "json"): string => (type === "integer" ? "integer" : "text");

const createTable = (name: TableName, columns: Record<string, "text" | "integer" | "json">): string => {
  const defs = Object.entries(columns).map(([column, type]) =>
    column === "id" ? "id text primary key not null" : `${column} ${sqlType(type)}`,
  );
  return `create table if not exists ${name} (${defs.join(", ")});`;
};

const toBind = (value: unknown, isJson: boolean): string | number | null => {
  if (value === undefined || value === null) return null;
  if (isJson) return JSON.stringify(value);
  // A boolean has no SQLite type. `optional` is declared integer for exactly this reason,
  // and 0/1 is what the core reads back, so anything checking it must not use ===true.
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  return String(value);
};

const fromRow = (table: TableName, raw: Record<string, unknown>): Row => {
  const out: Record<string, unknown> = { ...raw };
  for (const column of JSON_COLUMNS.get(table) ?? []) {
    const value = out[column];
    out[column] = typeof value === "string" ? JSON.parse(value) : null;
  }
  return out as Row;
};

class SqliteStore implements Store {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async get<T extends Row>(table: TableName, id: string): Promise<T | null> {
    const raw = await this.db.getFirstAsync<Record<string, unknown>>(`select * from ${table} where id = ?`, id);
    // null, never undefined: the core's callers test for null and getFirstAsync's own
    // absence value is not the one the contract promises.
    return raw ? (fromRow(table, raw) as T) : null;
  }

  async all<T extends Row>(table: TableName): Promise<T[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(`select * from ${table}`);
    return rows.map((raw) => fromRow(table, raw) as T);
  }

  async put(table: TableName, row: Row): Promise<void> {
    const columns = COLUMNS.get(table) ?? [];
    const jsonColumns = new Set(JSON_COLUMNS.get(table) ?? []);
    // Every column, always, and `insert or replace`, because put REPLACES a row: an upsert
    // that only set the keys it was given would leave the previous row's other values in
    // place and silently merge two revisions of a recipe.
    const values = columns.map((column) => toBind(row[column], jsonColumns.has(column)));
    await this.db.runAsync(
      `insert or replace into ${table} (${columns.join(", ")}) values (${columns.map(() => "?").join(", ")})`,
      values,
    );
  }

  async remove(table: TableName, id: string): Promise<void> {
    await this.db.runAsync(`delete from ${table} where id = ?`, id);
  }

  async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    let result: T;
    // withTransactionAsync rolls back when the task throws and rethrows, which is the
    // contract. `this` is passed through because the driver's transaction is on the
    // connection, so writes made through it are already inside it.
    await this.db.withTransactionAsync(async () => {
      result = await fn(this);
    });
    return result!;
  }
}

export async function createSqliteStore(name: string): Promise<Store> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(
    ["pragma journal_mode = WAL;", ...SCHEMA.map((table) => createTable(table.name, table.columns))].join("\n"),
  );
  return new SqliteStore(db);
}
