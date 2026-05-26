import { Card } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// 強制 Node runtime：Supabase auth 在 server action 內讀 / 寫 cookies，
// 需要完整 Node Cookie API 支援（@supabase/ssr 在 Edge 也可用，但為了
// 跟其他需要 Sensitive env 的 server actions 保持一致，固定 Node）
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
            登入帳號或註冊新會員
          </p>
        </div>

        <Card className="px-6 py-8">
          <LoginForm />
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          資料完全隔離，每位會員只看得到自己的記帳紀錄
        </p>
      </div>
    </main>
  );
}
