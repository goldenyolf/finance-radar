@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Next 16 Turbopack dev server @ http://localhost:3000
npm run build     # production build
npm run start     # run built app
npm run lint      # ESLint (strict: react-hooks/set-state-in-effect enabled)

npx tsc --noEmit -p tsconfig.json     # typecheck (no build)
npx eslint <path>                     # lint specific file
```

There are no unit tests wired up. Correctness is verified via typecheck + lint
+ manual smoke test. Migrations are run **manually** via Supabase SQL Editor —
there's no `supabase db push` step in this repo.

## Architecture — the parts that require reading multiple files

### Multi-tenant data model

Every user-owned table has `user_id UUID` referencing `auth.users(id)`. All
mutations must be scoped by `user_id` for **two** reasons:

1. **RLS policies** on the tables (added incrementally per-table via migrations
   `0007`, `0024`, `0028`) — the primary fence.
2. **Belt-and-suspenders `.eq("user_id", uid)`** in every server action —
   defensive layer for when RLS is momentarily off (dev / mid-migration) or
   when a future refactor swaps `createClient()` for `createServiceClient()`.

When adding a new mutation path: fetch `auth.getUser()` at the top, capture
`uid`, and add `.eq("user_id", uid)` to every `.update()` / `.delete()` /
`.select()` chain — do not rely on RLS alone.

### Two Supabase clients — do NOT mix

- `@/lib/supabase/server` → user-scoped JWT client, respects RLS. Used by
  Server Actions and RSC.
- `@/lib/supabase/service` (`createServiceClient`) → **bypasses RLS**. Used
  ONLY by the LINE webhook and Vercel Cron because they act on the user's
  behalf without a JWT. When writing via this client you MUST `.eq("user_id", …)`
  explicitly — RLS is not there to catch mistakes.

### `transactions.category` holds two shapes (per migration 0030)

The `CHECK constraint` limiting `category` to 7 built-in codes was dropped:
the column now stores EITHER a built-in code (`'food_dining'` etc, seven
values from `EXPENSE_CATEGORY_LABEL`) OR a `categories.id` UUID (user-defined
category). Reading the column always goes through:

```ts
import { resolveCategory } from "@/lib/categories";
const cat = resolveCategory(row.category, lookup);   // byId → byCode → null
```

Any code that does `lookup.byCode.get(row.category)` alone is buggy — it will
miss custom UUIDs and render them as fallback "其他" grey. Same for pie/chart
aggregators grouping by category value.

### `transactions.project_tag` isolates special projects (per 0028)

Freeform text tag (`太太醫療`, `新居家電`, …). The analytics page has a
slim isolation switch that partitions transactions into `mainTransactions` +
`archivedTransactions` based on `project_tag != null` intersected with a
user-selected tag denylist. All monthly charts consume `mainTransactions` so
they can spring-reflow when isolation toggles. See `analytics-view.tsx` for
the three-stage filter (account scope → tag partition → to tabs).

### Server Action → `revalidatePath` chains

When mutating `transactions` / `accounts` / `wealth_snapshots`, actions must
`revalidatePath("/")`, `/analytics`, `/transactions`, `/net-worth` as
appropriate — the RSC pages read `loadDashboard()` fresh on each request. Miss
one and the user sees stale numbers after edit until they navigate away.

### LINE webhook flow (`/api/line/webhook/route.ts`)

`handleTextMessage` runs a specific pipeline; changes to it can silently
regress classification. Order matters:

1. `tryGoalDeposit` — hard-coded 夢想基金 intent short-circuits
2. `detectTransactionType` — keyword-based income/expense classification (26
   Chinese keywords, no LLM)
3. `interceptAccountKeywords` — hard-rule account matching from
   `accounts.keywords`. **When matched, ALL keywords of that account are
   stripped from the LLM input text.** Migration `0029` removed `早餐`/`夜市`
   from `cash_wallet.keywords` for this reason — they were context words that
   got over-stripped.
4. `parseLineMessageWithLlm` — Gemini extracts `{item, amount, account_override, category, payment_method, income_category}`
5. `stripDescriptionLabel(item)` — unconditionally strips leading
   `支付：` / `支出：` etc labels. (Do NOT gate this with `if (stripped)` —
   review #6 fix.)
6. `resolveTargetAccount` — 7-stage account fallback chain

### base-ui, not Radix — several subtle gotchas

The UI primitives (`Dialog`, `Popover`, `Select`, `Tooltip`, `Switch`,
`Checkbox`, `Collapsible`) wrap `@base-ui/react` 1.5, NOT Radix. Consequences:

- **`<DialogTrigger render={<Button/>}>` silently breaks click handling.** Two
  layers of `useButton()` fight for `onClick`. Always use `controlled open` +
  a plain `<Button onClick={() => setOpen(true)}>`.
- **`<Select.Value>` needs render-function children**, else the trigger shows
  raw `value` (e.g. `food_dining` instead of "餐飲食品").
- Collapsible animation requires bridging CSS vars — see
  `src/app/globals.css` alias `--radix-collapsible-content-height` →
  `--collapsible-panel-height`. tw-animate-css keyframes target the Radix
  name; base-ui exports the base-ui name. Without the alias, panels
  snap-open instead of animating.
- Checkbox `Indicator` with `keepMounted` renders even when unchecked; the
  project's wrapper puts icons directly in `Root` and gates visibility with
  `group-data-[checked]/data-[indeterminate]` CSS instead.

### Next 16 renamed middleware → proxy

`middleware.ts` was renamed `proxy.ts`, exported function is `proxy()`.
Public routes (login / forgot-password / update-password) must be in the
proxy matcher's excluded paths — otherwise Supabase recovery tokens (which
live in the URL fragment) get stripped by an intermediate redirect.

### Sensitive env vars in Server Actions

Vercel "Sensitive" env vars are not visible in the Edge runtime. Server
Actions that read them (`GEMINI_API_KEY`, `OPENAI_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) must `export const runtime = "nodejs"` at the
route/file level.

## Supabase SQL Editor quirks (migrations)

- **ASCII-only headers** in migration files. Unicode box-drawing (╔═╗) crashes
  the pre-parser (42601).
- Use `position('x' in col) > 0` instead of `ILIKE '%x%'` — the pre-parser
  mishandles `%` string literals.
- Large migrations are wrapped in a single implicit transaction: a failure at
  phase 4 rolls back phases 1-3. Split when possible.
- `DO $$ BEGIN ... END $$` blocks with DDL inside easily hit dollar-quote
  parse traps — prefer `$body$` as the tag and keep DDL out of the block when
  you can.
- `auth.uid()` is `NULL` when running SQL directly in the Editor (no JWT).
  Any query using it returns 0 rows / fails NOT NULL. Test with explicit UUID
  values instead.

## Naming conventions that WILL bite you

- **All DB enum values are `snake_case`** and mirrored 1:1 in TS literal
  types. `'food_dining'` in DB CHECK ↔ `"food_dining"` in
  `ExpenseCategory` union. One typo and inserts fail with `23514`.
- `accounts.id` is `TEXT`, not UUID (legacy). Foreign keys to it must also be
  `TEXT` or PG errors with `42804 incompatible types`.
- `accounts.type` has a hidden CHECK constraint not declared in a shipped
  migration. Adding a new type value needs `DROP CONSTRAINT + ADD
  CONSTRAINT` first, else `INSERT` throws `23514`.
- `auth.users` triggers must be `SECURITY DEFINER` with inline `INSERT` and
  an `EXCEPTION` block — otherwise new signups fail with "Database error
  saving new user".
- Partial unique indexes: `INSERT … ON CONFLICT (cols) …` doesn't infer the
  index predicate; you must repeat `WHERE …` in the ON CONFLICT clause or
  PG throws `42P10`.

## Directory map

```
src/
├── app/
│   ├── (auth)/             # login / forgot-password / update-password
│   ├── (dashboard)/        # protected pages (RSC + Suspense)
│   ├── api/
│   │   ├── line/webhook/   # multimodal LINE entry (text / voice / vision)
│   │   └── cron/           # Vercel Cron entry points
│   └── proxy.ts            # Next 16 middleware (renamed)
├── components/
│   ├── dashboard/          # feature components (30+, business logic)
│   └── ui/                 # base-ui wrappers + shadcn tokens
└── lib/
    ├── actions/            # Server Actions (createClient, revalidatePath)
    ├── supabase/
    │   ├── server.ts       # user-scoped JWT client (RLS on)
    │   ├── client.ts       # browser client
    │   └── service.ts      # service-role (RLS off) — LINE + Cron only
    ├── dashboard.ts        # TransactionRow / AccountRow types + core aggregators
    ├── categories.ts       # buildCategoryLookup + resolveCategory
    ├── expense-categories.ts   # EXPENSE_CATEGORY_LABEL / _COLOR / classifyByKeyword / aggregateMonthlyByCategory
    ├── description-normalize.ts # stripDescriptionLabel (支付/支出/收入 …)
    ├── line-llm-parse.ts   # Gemini JSON prompt + normalize
    ├── line-account-keyword-interceptor.ts  # hard-rule account routing
    ├── budget-alerts.ts    # LINE push alert logic
    ├── daily-spend.ts / sankey-data.ts / financial-elasticity.ts  # analytics aggregators
    └── load-*.ts           # RSC data loaders (called from page.tsx)

supabase/migrations/         # 0001-0031, applied manually via SQL Editor
```

## When you edit a server action

Follow the pattern in `src/lib/actions/transactions.ts` — it's the reference
shape:

- Return `Promise<MutationResult>` where `MutationResult = { ok: true } | { ok: false; error: string }`
- For bulk actions, `BulkMutationResult` includes `updatedCount` and
  `skippedCount` so the UI can honestly report partial success.
- Fetch `auth.getUser()`, capture `uid`, gate on `!uid → 尚未登入`
- Apply mutations with `.in / .eq` chains, always including `.eq("user_id", uid)`
- For validation of category / project_tag: normalise (`trim() || null`),
  then either whitelist (built-in codes) or verify ownership via `categories`
  table.
- Call `revalidatePath()` for every affected route.
- For expense mutations, `await runBudgetAlerts(supabase, uid)` at the end —
  category / amount changes may cross a budget threshold.
