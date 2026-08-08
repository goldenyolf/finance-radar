"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage 持久化的 boolean 開關，用 useSyncExternalStore 讀。
 *
 * 取代原本三處的
 *   const [v, setV] = useState(false);
 *   useEffect(() => { setV(localStorage.getItem(k) === "on"); }, []);
 * 寫法 —— 那會被 react-hooks/set-state-in-effect 擋下，而且多跑一次 render
 * （false → 真值），造成一次可見的閃爍。
 *
 * 真正的 source of truth 是 localStorage 本身，不是 React state。好處：
 *   - server / hydration 前一律回 false（getServerSnapshot），不會 mismatch
 *   - 跨分頁同步免費附贈（監聽 storage 事件）
 *   - 同一頁多個 subscriber（例如 Navigation 與 MainPad 同時讀 sidebar 狀態）
 *     天然一致，不必靠 Context 傳
 *
 * localStorage 不可用時（Safari 無痕 / 使用者關閉）降級到 module 內的
 * memoryFallback：值只活在這次 page session，但 toggle 仍然有反應 —— 不會
 * 出現「按了沒事」的死按鈕。
 */

const memoryFallback = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
  // storage 事件只會發給「其他」分頁，本頁要自己通知
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribeTo(key: string, onChange: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);

  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("storage", onStorage);
    const current = listeners.get(key);
    current?.delete(onChange);
    if (current && current.size === 0) listeners.delete(key);
  };
}

export interface PersistedFlag {
  value: boolean;
  set: (next: boolean) => void;
  toggle: () => void;
}

/**
 * @param key       localStorage key
 * @param onValue   代表 true 的字面值（例："on" / "true"）。其餘一律視為 false，
 *                  包含 key 不存在的情況 —— 跟原本三處的判斷完全一致。
 * @param offValue  代表 false 的字面值，寫入時用。
 */
export function usePersistedFlag(
  key: string,
  onValue: string,
  offValue: string
): PersistedFlag {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeTo(key, onChange),
    [key]
  );
  const getSnapshot = useCallback(() => readRaw(key) === onValue, [key, onValue]);
  // server 端沒有 localStorage，一律 false（跟原本 useState(false) 初值一致）
  const getServerSnapshot = useCallback(() => false, []);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (next: boolean) => writeRaw(key, next ? onValue : offValue),
    [key, onValue, offValue]
  );
  const toggle = useCallback(
    () => writeRaw(key, readRaw(key) === onValue ? offValue : onValue),
    [key, onValue, offValue]
  );

  return { value, set, toggle };
}
