"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Sidebar 摺疊狀態 — 全域 Provider。
 *
 * 為什麼跟 PrivacyProvider 同款 pattern：
 *   - state 由 <Navigation> sidebar UI 與 <MainPad> padding-left 共讀，
 *     單一 source of truth 最簡單。
 *   - localStorage 持久化讓使用者「摺疊一次後永遠摺疊」的偏好被尊重。
 *   - mounted guard：SSR 先給 false，掛載後同步 localStorage，避免
 *     hydration mismatch（跟 PrivacyProvider 一樣是 ~16ms flash，可接受）。
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 初次掛載：從 localStorage 讀回上次設定
  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(STORAGE_KEY);
      if (persisted === "true") setIsCollapsed(true);
    } catch {
      // localStorage 不可用 → 安靜降級成 false
    }
    setMounted(true);
  }, []);

  // state 改變 → 寫回 localStorage
  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(isCollapsed));
    } catch {
      // 寫失敗不影響功能
    }
  }, [isCollapsed, mounted]);

  const toggle = useCallback(() => setIsCollapsed((v) => !v), []);
  const setCollapsed = useCallback((next: boolean) => setIsCollapsed(next), []);

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
