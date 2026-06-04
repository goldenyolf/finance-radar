"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Loader2Icon, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { CsvImportDialog } from "@/components/dashboard/csv-import-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CategoryRow } from "@/lib/categories";
import type { AccountRow } from "@/lib/dashboard";
import {
  parseImportCsv,
  type ImportPreview,
} from "@/lib/actions/import-transactions";
import { cn } from "@/lib/utils";

interface Props {
  accounts: AccountRow[];
  categories?: CategoryRow[];
}

/**
 * CSV 拖放匯入區 — Apple 深色毛玻璃 + 翡翠綠 hover 框。
 *
 * 行為：
 *   1) 使用者拖檔進來 / 點選按鈕選檔
 *   2) FormData → parseImportCsv server action
 *   3) 後端回 preview → 開 CsvImportDialog 給使用者確認
 *   4) Dialog 內按「確認匯入」→ confirmImport → toast + router.refresh
 *
 * 視覺：
 *   - 預設 border-dashed border-zinc-700 + bg-zinc-950/50 + backdrop-blur
 *   - 拖檔懸停（dragOver=true）→ ring-emerald-500/50 + bg-emerald-500/[0.04]
 *   - 解析中 → Loader2 spin overlay
 */
export function CsvImportZone({ accounts, categories }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("請選擇 .csv 檔案", {
        description: "目前只支援中信 / 台新信用卡明細 CSV 格式",
      });
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const result = await parseImportCsv(fd);
      if (!result.ok) {
        toast.error("解析失敗", { description: result.error });
        return;
      }
      if (result.rows.length === 0) {
        toast.warning("CSV 沒有有效資料列");
        return;
      }
      setPreview(result);
    });
  }

  // 拖放事件 —— dragenter/over 都要 preventDefault 才會真的允許 drop
  function onDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // 防止子元素觸發 leave — 比對 relatedTarget 是否還在容器內
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // reset 讓使用者連續挑同檔也能 trigger
  }

  return (
    <>
      <Card
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "group relative mb-6 border-2 border-dashed border-zinc-700 bg-zinc-950/50 backdrop-blur-sm transition-all duration-200",
          dragOver &&
            "border-emerald-500/60 bg-emerald-500/[0.04] ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10",
          pending && "pointer-events-none opacity-70"
        )}
      >
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:flex-row sm:gap-6 sm:text-left">
          <div
            className={cn(
              "grid size-14 shrink-0 place-items-center rounded-2xl bg-foreground/[0.04] ring-1 ring-foreground/10 transition-all",
              dragOver &&
                "bg-emerald-500/10 ring-emerald-500/40 scale-110"
            )}
          >
            {pending ? (
              <Loader2Icon className="size-6 animate-spin text-emerald-400" />
            ) : (
              <FileUp
                className={cn(
                  "size-6 transition-colors",
                  dragOver ? "text-emerald-400" : "text-muted-foreground"
                )}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold sm:justify-start">
              <Sparkles className="size-3.5 text-emerald-400" />
              智慧匯入信用卡明細 CSV
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                Beta
              </span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              拖檔到這裡或
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mx-1 inline-flex items-center gap-1 rounded-md bg-foreground/[0.06] px-2 py-0.5 font-medium text-foreground hover:bg-foreground/[0.1]"
              >
                <Upload className="size-3" />
                點此選檔
              </button>
              。目前支援 <strong>中國信託 (CTBC)</strong> 與{" "}
              <strong>台新銀行 (Taishin)</strong> 信用卡帳單 CSV，後端會自動分類 + 重複檢查。
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="shrink-0 gap-1.5 rounded-full"
          >
            <Upload className="size-3.5" />
            選擇檔案
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={onChange}
            aria-label="選擇 CSV 檔案"
          />
        </div>
      </Card>

      {preview && (
        <CsvImportDialog
          preview={preview}
          accounts={accounts}
          categories={categories}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
