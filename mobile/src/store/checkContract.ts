import * as SQLite from "expo-sqlite";
import { CONTRACT } from "../../../src/mobile/store/contract";
import { createSqliteStore } from "./sqlite";

export type CaseResult = { name: string; ok: boolean; error: string | null };

/**
 * Runs the Store contract against the real SQLite driver, on the device. This is the only
 * place that can: expo-sqlite is native, so vitest cannot reach it, and a contract that only
 * ever ran against the memory store would report success for the implementation it cannot
 * see. The same failure shape this repo has paid for in `routes.terms.test.ts`.
 *
 * Each case gets a FRESH database, deleted first, because the cases are written against an
 * empty store and a leftover file from the previous run would make them pass or fail for
 * reasons that have nothing to do with the code.
 */
export async function checkSqliteStore(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const [index, contractCase] of CONTRACT.entries()) {
    const name = `contract-${index}.db`;
    try {
      await SQLite.deleteDatabaseAsync(name).catch(() => undefined);
      await contractCase.run(await createSqliteStore(name));
      results.push({ name: contractCase.name, ok: true, error: null });
    } catch (error) {
      results.push({ name: contractCase.name, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
