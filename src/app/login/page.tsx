import { Card } from "@/components/ui/card";

import { LoginForm } from "./login-form";

// 登入頁完全 server-render，但不需快取（PIN 邏輯走 server action）
export const dynamic = "force-dynamic";

// 強制 Node runtime：login server action 要讀 process.env.SITE_PIN，
// 而 Vercel 的 Sensitive env vars 對 Edge runtime 是不可見的。
// 走 Node 雖然冷啟動慢 ~500ms，但登入頁不在乎這點延遲。
export const runtime = "nodejs";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Money Radar
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            個人財務戰情室
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            請輸入 PIN 以保護你的財務隱私
          </p>
        </div>

        <Card className="px-6 py-8">
          <LoginForm />
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          解鎖後 30 天內免再登入
        </p>
      </div>
    </main>
  );
}
