"use client";

import { createContext, useContext, useEffect } from "react";

import { useIsMounted } from "@/hooks/use-is-mounted";
import { usePersistedFlag } from "@/hooks/use-persisted-flag";

/**
 * 防窺模式（Privacy / Incognito Mode）— 全域開關。
 *
 * 為什麼 React Context 夠用、不需要 Zustand / Jotai：
 *   - 真正模糊金額是 CSS 工作（body[data-privacy="on"] [data-money] { filter: blur(...) }），
 *     不是 React render 工作 → 切換時整個元件樹「零」re-render，只有 toggle 按鈕本身 re-render。
 *   - Context 只負責 1 個 bool + 1 個 setter，無 fan-out 效能擔憂。
 *
 * 持久化：localStorage 就是 source of truth（見 usePersistedFlag），不再是
 * 「React state + useEffect 讀回」。原本那個寫法會被
 * react-hooks/set-state-in-effect 擋下，而且多跑一次 render（false → 真值）
 * 造成防窺模式在載入時閃一下明碼。
 *
 * 剩下的 useEffect 是真正的「同步外部系統」（把狀態寫到 body dataset 給 CSS
 * 讀），沒有 setState，符合 effect 的本意。
 */

const STORAGE_KEY = "money-radar:privacy";

interface PrivacyContextValue {
  isPrivacyMode: boolean;
  togglePrivacy: () => void;
  setPrivacy: (next: boolean) => void;
  /** SSR / 首次掛載前為 false；UI 可用這個判斷要不要顯示「依持久化值」的 icon 狀態 */
  mounted: boolean;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const mounted = useIsMounted();
  const {
    value: isPrivacyMode,
    set: setPrivacy,
    toggle: togglePrivacy,
  } = usePersistedFlag(STORAGE_KEY, "on", "off");

  // 同步到 body dataset — CSS 用 body[data-privacy="on"] selector 做模糊，
  // 這是唯一的觸發點。純粹寫外部系統、沒有 setState。
  useEffect(() => {
    if (!mounted) return;
    document.body.dataset.privacy = isPrivacyMode ? "on" : "off";
  }, [isPrivacyMode, mounted]);

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
