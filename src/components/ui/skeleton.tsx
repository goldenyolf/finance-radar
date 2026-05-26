import { cn } from "@/lib/utils";

/**
 * shadcn 風格的 Skeleton — 純樣式元件，靠 Tailwind animate-pulse 製造佔位效果。
 * bg-muted 走 semantic token，light/dark 自動切換。
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
      {...props}
    />
  );
}

export { Skeleton };
