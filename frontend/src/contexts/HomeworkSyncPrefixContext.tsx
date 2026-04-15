/**
 * HomeworkSyncPrefixContext.tsx
 *
 * When non-null, `useLiveSyncField` prefixes keys with this string so homework
 * exercises do not collide with in-lesson live keys (`ex/…` vs `hwu/{unitId}/ex/…`).
 */

import React, { createContext, useContext } from "react";

/** Prefix such as `hwu/42/` including trailing slash, or null for lesson mode */
export const HomeworkSyncPrefixContext = createContext<string | null>(null);

export function HomeworkSyncPrefixProvider({
  value,
  children,
}: {
  value: string | null;
  children: React.ReactNode;
}) {
  return (
    <HomeworkSyncPrefixContext.Provider value={value}>
      {children}
    </HomeworkSyncPrefixContext.Provider>
  );
}

export function useHomeworkSyncPrefix(): string | null {
  return useContext(HomeworkSyncPrefixContext);
}
