"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * 薄殼 wrapper：把 next-themes 的 Provider 包成 client 邊界，
 * 讓 server-side layout.tsx 可以直接 import 進來用。
 *
 * 配置由 layout.tsx 那邊傳入（attribute / defaultTheme / enableSystem 等）。
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
