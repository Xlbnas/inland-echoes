"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useCallback } from "react";
import { useTypewriterText } from "@/hooks/useTypewriterText";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import type { ProviderOutput } from "@/lib/types";

function statusLabel(status: ProviderOutput["status"]) {
  if (status === "streaming") return "接收中";
  if (status === "done") return "已完成";
  if (status === "error") return "调用失败";
  if (status === "stopped") return "已停止";
  return "待命";
}
export function RewriteResultCard({ id, output, index, copied, onCopy, onDisplayDone }: {
  id: string;
  output: ProviderOutput;
  index: number;
  copied: boolean;
  onCopy: (id: string) => void;
  onDisplayDone: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const complete = useCallback(() => onDisplayDone(id), [id, onDisplayDone]);
  const displayedText = useTypewriterText({
    receivedText: output.receivedText,
    networkDone: output.networkDone,
    stopped: output.status === "stopped" || output.status === "error",
    reducedMotion: Boolean(reduceMotion),
    startDelay: 80 + Math.min(index, 2) * 30,
    onComplete: complete,
  });

  return (
    <m.article
      className={`result ${output.status}`}
      data-state={output.status}
      data-network-state={output.networkDone ? "done" : "receiving"}
      key={id}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.08 : MOTION_DURATION.base, delay: reduceMotion ? 0 : index * 0.05, ease: MOTION_EASE.enter }}
    >
      <header>
        <div><span>{output.label}</span><small aria-live="polite" aria-atomic="true">{statusLabel(output.status)}</small></div>
        <button type="button" onClick={() => onCopy(id)} disabled={!output.receivedText}>
          <span className="copy-label">
            <AnimatePresence initial={false} mode="wait">
              <m.span key={copied ? "copied" : "copy"} initial={reduceMotion ? false : { opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -2 }} transition={{ duration: reduceMotion ? 0.08 : MOTION_DURATION.instant }}>
                {copied ? "已复制" : "复制"}
              </m.span>
            </AnimatePresence>
          </span>
        </button>
      </header>
      {output.error ? <p className="result-error">{output.error}</p> : null}
      <div className="result-text" aria-live="off">
        {displayedText || (output.status === "streaming" ? "正在建立语言模型连接…" : "")}
        {output.status === "streaming" ? <span className="cursor" aria-hidden="true" /> : null}
      </div>
    </m.article>
  );
}
