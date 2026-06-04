import type { MetadataRoute } from "next";

/**
 * Web App Manifest (Next.js 16 Metadata Route)
 *
 * Next.js 會把這支 default export 渲染成 /manifest.webmanifest，
 * 自動掛在 <link rel="manifest"> 上、無需 layout.tsx 額外 link。
 *
 * 設計要點：
 *   - display=standalone：行動端「加入主畫面」開啟時隱藏 Safari/Chrome 工具列
 *   - orientation=portrait：理財戰情室不需橫向，鎖直立避免圖表破版
 *   - background / theme color = #09090b zinc-950 = 全站底色，啟動畫面 +
 *     status bar 跟內容無縫融合
 *   - icons 192/512 PNG + purpose='any maskable'：Android adaptive icon
 *     會自動裁圓角，maskable 保證 safe zone 不被切掉內容
 *
 * ⚠️ Icon 檔案待補：
 *   - 在 public/ 放 icon-192.png + icon-512.png 才能讓 PWA install prompt 真正出現
 *   - 暫時沒檔案 → manifest 仍 valid 但 install 體驗會打折
 *   - 推薦工具：https://realfavicongenerator.net 一次生成全套 (PNG + ICO + SVG)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Money Radar — 個人財務戰情室",
    short_name: "Money Radar",
    description:
      "LINE AI 一句話記帳 × 多帳戶現金分流 × 6 維度智慧分析的家庭財務戰情室。",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    lang: "zh-TW",
    categories: ["finance", "productivity", "lifestyle"],
    // any 跟 maskable 拆成獨立 entry — Next.js 型別不接受空格合併寫法。
    // any = 顯示原圖（iOS / 一般場景）；maskable = Android adaptive icon
    // 自動裁圓角時保 safe zone。
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
