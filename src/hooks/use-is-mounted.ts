"use client";

import { useSyncExternalStore } from "react";

/** 永不觸發的 subscribe — 這個「store」的值只會從 false 變 true 一次（hydration）。 */
const neverChanges = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * 「已經 hydrate 完了嗎」— SSR 與 client 首次 render 回 false，hydration 後 true。
 *
 * 取代散落在 10 個元件裡的 `useEffect(() => setMounted(true), [])`。
 * 那個寫法會被 react-hooks/set-state-in-effect 擋下（本專案 eslint 開了嚴格
 * 模式），而且語意上也不對：它不是在「同步外部系統」，是在描述「render 這件
 * 事發生在 server 還是 client」。useSyncExternalStore 的 getServerSnapshot /
 * getSnapshot 二元性正好就是這個語意，而且不會多一次 render。
 *
 * 典型用途：recharts 圖表要讀 next-themes 的 resolvedTheme 決定深淺色，
 * 但 server 端拿不到 → 先用 false 走淺色，hydrate 後再切，避免 hydration
 * mismatch。
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(neverChanges, clientSnapshot, serverSnapshot);
}
