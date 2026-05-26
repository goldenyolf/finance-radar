"use client";

import { motion } from "framer-motion";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * 頁面進場動畫的薄殼：server pages 可以直接把整段 <main> 包進來，
 * 而不用把 page.tsx 整支轉成 client component（保留 RSC 好處）。
 *
 * Variants 設定符合 spec：initial { y: 15, opacity: 0 } → animate { y: 0, opacity: 1 }
 * easeOut 0.4s — 輕盈向上浮出的高級感。
 */
export function PageTransition({ children, className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
