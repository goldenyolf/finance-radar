/**
 * Auth 路由組 layout — 登入頁專用。極簡：全螢幕置中 + 深色漸層背景。
 *
 * 刻意不 import Navigation，所以登入頁完全不會有 sidebar / bottom tab bar
 * 干擾視覺。背景用 slate-950 → slate-900 → indigo-950 三段漸層，配合
 * 毛玻璃登入卡片做出「夜空中浮現」的金融科技感。
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-12">
      {children}
    </main>
  );
}
