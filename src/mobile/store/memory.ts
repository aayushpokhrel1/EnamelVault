import type { Store, TableName, Row } from "./types";

class MemoryStore implements Store {
  private tables: Map<TableName, Map<string, Row>>;

  constructor() {
    this.tables = new Map();
  }

  async get<T extends Row>(table: TableName, id: string): Promise<T | null> {
    const tableMap = this.tables.get(table);
    if (!tableMap) return null;
    const row = tableMap.get(id);
    // A COPY in both directions. Rows handed out by reference let a screen mutate the store
    // by editing what it rendered, and rows taken in by reference let a caller change a row
    // it already wrote. Both are silent.
    return row ? ({ ...row } as T) : null;
  }

  async all<T extends Row>(table: TableName): Promise<T[]> {
    const tableMap = this.tables.get(table);
    if (!tableMap) return [];
    return Array.from(tableMap.values(), (row) => ({ ...row }) as T);
  }

  async put(table: TableName, row: Row): Promise<void> {
    let tableMap = this.tables.get(table);
    if (!tableMap) {
      tableMap = new Map();
      this.tables.set(table, tableMap);
    }
    tableMap.set(row.id, { ...row });
  }

  async remove(table: TableName, id: string): Promise<void> {
    const tableMap = this.tables.get(table);
    if (tableMap) {
      tableMap.delete(id);
    }
  }

  async transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    const snapshots = new Map<TableName, Map<string, Row>>();
    this.tables.forEach((tableMap, tableName) => {
      snapshots.set(tableName, new Map(tableMap));
    });

    try {
      const result = await fn(this);
      return result;
    } catch (error) {
      // REPLACE the map rather than restoring the tables it had. Writing each snapshot back
      // leaves behind any table the transaction CREATED, because an empty store has no entry
      // to snapshot: the first put into "recipes" made the table, the rollback had nothing to
      // say about it, and the row survived the throw. That is the exact failure this method
      // exists to prevent, and it passed every test but the one that started from empty.
      this.tables = snapshots;
      throw error;
    }
  }
}

export function createMemoryStore(): Store {
  return new MemoryStore();
}