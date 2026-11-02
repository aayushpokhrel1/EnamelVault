import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Store } from "../../src/mobile/store/types";

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * The signed-in account's local database. Every screen below the gate has one, which is why
 * this throws rather than returning null: a screen rendering without a store would be a
 * screen outside the account boundary, and the point of the boundary is that there is no
 * such place.
 *
 * It lives here rather than in app/_layout.tsx so that screens import a module, not a route.
 */
export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore was called outside the signed-in app.");
  return store;
}
