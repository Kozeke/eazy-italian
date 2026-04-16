/**
 * HomeworkContext.tsx
 *
 * Provides a shared homework item list across the ClassroomPage tree.
 *
 * API:
 *   items       — current list of homework items (ordered)
 *   addItem     — append a new item (or replace if id already exists)
 *   removeItem  — remove by id
 *   reorderItem — move an item up or down
 *
 * HomeworkItem.item is typed as `any` here so the context stays agnostic
 * about the exact FlowItem shape — each exercise block self-describes its
 * own data requirements.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useState,
  } from "react";
  
  // ─── Types ────────────────────────────────────────────────────────────────────
  
  export interface HomeworkItem {
    /** Client-side unique id */
    id: string;
    /** The flow item passed to FlowItemRenderer — matches the exercise block data shape */
    item: any;
    /** True when the item was copied from the current lesson (shows "Из урока" badge) */
    copiedFromLesson?: boolean;
  }
  
  interface HomeworkContextValue {
    items: HomeworkItem[];
    /** Add a new item. If an item with the same id already exists it is replaced. */
    addItem: (item: HomeworkItem) => void;
    /** Remove item by id */
    removeItem: (id: string) => void;
    /** Move item one step up or down in the list */
    reorderItem: (id: string, direction: "up" | "down") => void;
  }
  
  // ─── Context ──────────────────────────────────────────────────────────────────
  
  const HomeworkContext = createContext<HomeworkContextValue | null>(null);
  
  // ─── Provider ─────────────────────────────────────────────────────────────────
  
  export function HomeworkProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<HomeworkItem[]>([]);
  
    const addItem = useCallback((item: HomeworkItem) => {
      setItems((prev) => {
        const exists = prev.findIndex((i) => i.id === item.id);
        if (exists >= 0) {
          // Replace existing (e.g. edit flow)
          const next = [...prev];
          next[exists] = item;
          return next;
        }
        return [...prev, item];
      });
    }, []);
  
    const removeItem = useCallback((id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, []);
  
    const reorderItem = useCallback(
      (id: string, direction: "up" | "down") => {
        setItems((prev) => {
          const idx = prev.findIndex((i) => i.id === id);
          if (idx < 0) return prev;
          const next = [...prev];
          const swapWith = direction === "up" ? idx - 1 : idx + 1;
          if (swapWith < 0 || swapWith >= next.length) return prev;
          [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
          return next;
        });
      },
      [],
    );
  
    return (
      <HomeworkContext.Provider value={{ items, addItem, removeItem, reorderItem }}>
        {children}
      </HomeworkContext.Provider>
    );
  }
  
  // ─── Hook ─────────────────────────────────────────────────────────────────────
  
  export function useHomework(): HomeworkContextValue {
    const ctx = useContext(HomeworkContext);
    if (!ctx) {
      throw new Error("useHomework must be used inside <HomeworkProvider>");
    }
    return ctx;
  }