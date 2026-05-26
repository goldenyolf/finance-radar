import { Target } from "lucide-react";

import { GoalTrackerCard } from "@/components/dashboard/goal-tracker-card";
import { PageTransition } from "@/components/dashboard/page-transition";
import { loadGoals } from "@/lib/load-goals";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await loadGoals();

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-4xl px-5 pt-10 pb-10 sm:px-6 lg:py-14">
        <header className="mb-8">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Goals
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            <Target className="size-7 text-muted-foreground" />
            夢想基金
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            把抽象的「想要」拆成可量化目標、可追蹤進度。每次提撥都會被記下來，
            達標時還會給你來場全螢幕彩帶派對 🎉
          </p>
        </header>

        <GoalTrackerCard goals={goals} />
      </main>
    </PageTransition>
  );
}
