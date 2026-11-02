/** The smallest key-value store this app needs, which is also what supabase-js asks for. */
export type KeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// iOS keychain entries are not meant to hold large values, and expo-secure-store warns
// above 2048 BYTES. A Supabase session is a JSON object carrying two JWTs and goes past that
// routinely, so the session would fail to persist and the cook would sign in again on every
// launch. 1800 leaves room for multi-byte characters in a name or an email.
const DEFAULT_LIMIT = 1800;

const headerFor = (count: number): string => `chunked:${count}`;
const partKey = (key: string, index: number): string => `${key}.${index}`;

const countIn = (header: string | null): number | null => {
  if (header === null || !header.startsWith("chunked:")) return null;
  const count = Number(header.slice("chunked:".length));
  return Number.isInteger(count) && count > 0 ? count : null;
};

/**
 * Splits values too large for the underlying store across numbered keys, with a header at
 * the original key saying how many parts there are.
 *
 * EVERY value goes through the header, including a short one. A scheme that stored small
 * values plainly would have to tell a plain value from a header by inspecting it, and a
 * value that happens to read like a header is then a silent data loss.
 */
export function chunkedStorage(inner: KeyValue, limit: number = DEFAULT_LIMIT): KeyValue {
  const clearParts = async (key: string, count: number) => {
    for (let index = 0; index < count; index += 1) await inner.removeItem(partKey(key, index));
  };

  return {
    async getItem(key) {
      const count = countIn(await inner.getItem(key));
      if (count === null) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await inner.getItem(partKey(key, index));
        // A MISSING PART MEANS NOTHING, not a shorter value. Returning what was found would
        // hand back a truncated session that parses as corrupt rather than as absent, and
        // the cook would be shown an error where they should have been shown sign-in.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    },

    async setItem(key, value) {
      const stale = countIn(await inner.getItem(key));
      const parts: string[] = [];
      for (let at = 0; at < value.length; at += limit) parts.push(value.slice(at, at + limit));
      if (parts.length === 0) parts.push("");

      for (const [index, part] of parts.entries()) await inner.setItem(partKey(key, index), part);
      // The header is written LAST, so a write interrupted halfway leaves the previous
      // value's header pointing at parts that are already gone, which getItem reads as
      // absent. Absent is recoverable; half of one session spliced onto half of another
      // is not.
      await inner.setItem(key, headerFor(parts.length));
      // Parts the shorter value no longer uses would otherwise sit there for ever, and the
      // next longer value would read a mix of the two.
      if (stale !== null && stale > parts.length) {
        for (let index = parts.length; index < stale; index += 1) await inner.removeItem(partKey(key, index));
      }
    },

    async removeItem(key) {
      const count = countIn(await inner.getItem(key));
      await inner.removeItem(key);
      if (count !== null) await clearParts(key, count);
    },
  };
}
