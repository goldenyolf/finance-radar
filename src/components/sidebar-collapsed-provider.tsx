"use client";

import { createContext, useContext } from "react";

import { useIsMounted } from "@/hooks/use-is-mounted";
import { usePersistedFlag } from "@/hooks/use-persisted-flag";

/**
 * Sidebar 摺疊狀態 — 全域 Provider。
 *
 * 為什麼跟 PrivacyProvider 同款 pattern：
 *   - state 由 <Navigation> sidebar UI 與 <MainPad> padding-left 共讀，
 *     單一 source of truth 最簡單。
 *   - localStorage 就是那個 source of truth（見 usePersistedFlag），不再是
 *     「React state + useEffect 讀回」—— 後者會被
 *     react-hooks/set-state-in-effect 擋下，也會多一次 render 造成
 *     sidebar 展開後才收合的閃爍。
 *   - mounted guard 保留：SSR / hydration 前一律 false，避免 mismatch。
 */

const STORAGE_KEY = "sidebar_collapsed";

interface SidebarCollapsedValue {
  isCollapsed: boolean;
  toggle: () => void;
  setCollapsed: (next: boolean) => void;
  /** SSR / 首次掛載前為 false；UI 可用這個判斷要不要顯示「依持久化值」狀態 */
  mounted: boolean;
}

const SidebarCollapsedContext = createContext<SidebarCollapsedValue | null>(
  null
);

export function SidebarCollapsedProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const mounted = useIsMounted();
  const {
    value: isCollapsed,
    set: setCollapsed,
    toggle,
  } = usePersistedFlag(STORAGE_KEY, "true", "false");

  return (
    <SidebarCollapsedContext.Provider
      value={{ isCollapsed, toggle, setCollapsed, mounted }}
    >
      {children}
    </SidebarCollapsedContext.Provider>
  );
}

/**
 * Hook：讀 / 寫 sidebar 摺疊狀態。Provider 之外用會 throw。
 */
export function useSidebarCollapsed(): SidebarCollapsedValue {
  const ctx = useContext(SidebarCollapsedContext);
  if (!ctx) {
    throw new Error(
      "useSidebarCollapsed must be used within <SidebarCollapsedProvider>"
    );
  }
  return ctx;
}
