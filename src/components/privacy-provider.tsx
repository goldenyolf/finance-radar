"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * 防窺模式（Privacy / Incognito Mode）— 全域開關。
 *
 * 為什麼 React Context 夠用、不需要 Zustand / Jotai：
 *   - 真正模糊金額是 CSS 工作（body[data-privacy="on"] [data-money] { filter: blur(...) }），
 *     不是 React render 工作 → 切換時整個元件樹「零」re-render，只有 toggle 按鈕本身 re-render。
 *   - Context 只負責 1 個 bool + 1 個 setter，無 fan-out 效能擔憂。
 *
 * 持久化：localStorage。SSR 階段拿不到 → 預設 false，掛載後讀回；
 * 用 mounted guard 避免 hydration mismatch。
 */

const STORAGE_KEY = "money-radar:privacy";
const BODY_ATTR = "data-privacy";

interface PrivacyContextValue {
  isPrivacyMode: boolean;
  togglePrivacy: () => void;
  setPrivacy: (next: boolean) => void;
  /** SSR / 首次掛載前為 false；UI 可用這個判斷要不要顯示「依持久化值」的 icon 狀態 */
  mounted: boolean;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 初次掛載：從 localStorage 讀回上次設定，並把當下狀態同步到 body
  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(STORAGE_KEY);
      if (persisted === "on") {
        setIsPrivacyMode(true);
      }
    } catch {
      // localStorage 不可用（隱私模式 / SSR）→ 安靜降級成 false
    }
    setMounted(true);
  }, []);

  // state 改變 → 寫 body dataset + localStorage
  // CSS 用 body[data-privacy="on"] selector，這裡是唯一的觸發點。
  useEffect(() => {
    if (!mounted) return;
    document.body.dataset.privacy = isPrivacyMode ? "on" : "off";
    try {
      window.localStorage.setItem(STORAGE_KEY, isPrivacyMode ? "on" : "off");
    } catch {
      // 同上，localStorage 失敗不影響功能
    }
  }, [isPrivacyMode, mounted]);

  const togglePrivacy = useCallback(() => {
    setIsPrivacyMode((v) => !v);
  }, []);

  const setPrivacy = useCallback((next: boolean) => {
    setIsPrivacyMode(next);
  }, []);

  return (
    <PrivacyContext.Provider
      value={{ isPrivacyMode, togglePrivacy, setPrivacy, mounted }}
    >
      {children}
    </PrivacyContext.Provider>
  );
}

/**
 * Hook：讀 / 寫防窺狀態。Provider 之外用會 throw — 防止忘記掛 Provider。
 */
export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) {
    throw new Error("usePrivacy must be used within <PrivacyProvider>");
  }
  return ctx;
}
