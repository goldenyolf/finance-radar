/**
 * 行動端硬體震動回饋 utility — 仿 iOS UIImpactFeedback 的微觸感。
 *
 * 平台支援現況（2026）：
 *   ✅ Android Chrome / Edge / Firefox          — 完整支援 navigator.vibrate
 *   ✅ Samsung Internet                          — 完整支援
 *   ⚠️  iOS Safari / Chrome / Firefox            — **不支援** navigator.vibrate
 *      WebKit 為避免廣告濫用刻意不實作；iOS 真實 haptic 只能透過
 *      `<a>` / `<button>` 的原生點擊事件（瀏覽器內部觸發系統 haptic）。
 *
 *   故本 utility 在 iOS 上是 **safe no-op** — 不報錯、不打斷流程，
 *   但 iOS 用戶手指不會真的感受到震動。Android 用戶會。
 *
 * 此外 SSR 階段 navigator 不存在；mount 前一律靜默 skip。
 */

export type HapticType =
  | "select"   // 10ms 極輕微 — segmented control 切換、卡片點擊
  | "success"  // 20ms 沉穩 — 核銷確認、儲存成功
  | "warning"  // 短-長-短 — 邊界值碰觸
  | "error"    // 長-停-長 — 操作失敗
  | "heavy";   // 30ms 重 — 重要刪除確認

/**
 * 震動模式對照表（ms 或 [on, off, on, off, ...] 陣列）。
 * 數值刻意對齊 iOS UIImpactFeedbackGenerator 的觸感階梯，跨平台情感一致。
 */
const HAPTIC_PATTERNS: Record<HapticType, number | number[]> = {
  select: 10,
  success: 20,
  warning: [10, 30, 10],
  error: [30, 50, 30],
  heavy: 30,
};

interface TriggerOptions {
  /**
   * 延遲幾毫秒後才震動。給「按鈕點 → 動畫 200ms 後落點 → 此時震動」
   * 的場景用（仿 iOS segmented control 落點吸附觸感）。
   * 預設 0 = 立刻。
   */
  delayMs?: number;
}

/**
 * 觸發指定類型的觸感反饋。
 *
 * @example
 *   triggerHaptic('select');                       // tab 切換立刻震
 *   triggerHaptic('select', { delayMs: 200 });     // 等 spring 落點再震
 *   triggerHaptic('success');                      // 核銷成功
 */
export function triggerHaptic(
  type: HapticType,
  options: TriggerOptions = {}
): void {
  // SSR / Node 環境：navigator 不存在，直接 skip
  if (typeof window === "undefined") return;
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return; // iOS Safari → silent skip

  const pattern = HAPTIC_PATTERNS[type];
  const fire = () => {
    try {
      navigator.vibrate(pattern);
    } catch {
      // 某些情境（iframe sandboxing / 隱私模式）會 throw — 全包安靜失敗
    }
  };

  if (options.delayMs && options.delayMs > 0) {
    window.setTimeout(fire, options.delayMs);
  } else {
    fire();
  }
}
