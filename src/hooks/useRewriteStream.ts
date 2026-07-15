"use client";

import { useCallback, useRef, useState } from "react";
import type { CheckRequest, CheckResult } from "@/lib/checks-shared";
import type {
  ProviderOutput,
  ProviderRequest,
  RewriteEvent,
  StyleId,
} from "@/lib/types";

export type DiceState = "idle" | "rolling" | "resolved";
type ProviderEvent = Exclude<RewriteEvent, { type: "check_resolved" }>;

const MINIMUM_ROLL_MS = 650;

export function useRewriteStream() {
  const [outputs, setOutputs] = useState<Record<string, ProviderOutput>>({});
  const [resultOrder, setResultOrder] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [diceState, setDiceState] = useState<DiceState>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  const rollStartedAtRef = useRef(0);
  const revealTimerRef = useRef<number | null>(null);
  const pendingResultRef = useRef<CheckResult | null>(null);
  const queuedEventsRef = useRef<ProviderEvent[]>([]);
  const finishRevealRef = useRef<(() => void) | null>(null);
  const revealPromiseRef = useRef<Promise<void> | null>(null);

  const applyProviderEvent = useCallback((event: ProviderEvent) => {
    setOutputs((current) => {
      const previous = current[event.providerId] || {
        label: event.providerId,
        text: "",
        status: "idle" as const,
      };

      if (event.type === "provider_start") {
        return {
          ...current,
          [event.providerId]: { label: event.label, text: "", status: "streaming" },
        };
      }
      if (event.type === "provider_delta") {
        return {
          ...current,
          [event.providerId]: {
            ...previous,
            text: previous.text + event.delta,
            status: "streaming",
          },
        };
      }
      if (event.type === "provider_done") {
        return { ...current, [event.providerId]: { ...previous, status: "done" } };
      }
      return {
        ...current,
        [event.providerId]: {
          ...previous,
          status: "error",
          error: event.message,
        },
      };
    });
  }, []);

  const revealPendingResult = useCallback(() => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
    const result = pendingResultRef.current;
    pendingResultRef.current = null;
    if (result) {
      setCheckResult(result);
      setDiceState("resolved");
    }
    const queued = queuedEventsRef.current;
    queuedEventsRef.current = [];
    queued.forEach(applyProviderEvent);
    finishRevealRef.current?.();
    finishRevealRef.current = null;
  }, [applyProviderEvent]);

  const clearCheckResult = useCallback(() => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
    pendingResultRef.current = null;
    queuedEventsRef.current = [];
    finishRevealRef.current?.();
    finishRevealRef.current = null;
    revealPromiseRef.current = null;
    setCheckResult(null);
    setDiceState("idle");
  }, []);

  const processEvent = useCallback((event: RewriteEvent) => {
    if (event.type === "check_resolved") {
      pendingResultRef.current = event.result;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const elapsed = performance.now() - rollStartedAtRef.current;
      const delay = reducedMotion ? 0 : Math.max(0, MINIMUM_ROLL_MS - elapsed);
      revealTimerRef.current = window.setTimeout(revealPendingResult, delay);
      return;
    }
    if (pendingResultRef.current || revealTimerRef.current !== null) {
      queuedEventsRef.current.push(event);
      return;
    }
    applyProviderEvent(event);
  }, [applyProviderEvent, revealPendingResult]);

  const generate = useCallback(async ({
    text,
    style,
    providers,
    check,
  }: {
    text: string;
    style: StyleId;
    providers: ProviderRequest[];
    check: CheckRequest;
  }) => {
    if (activeRef.current) return;
    activeRef.current = true;
    setError("");
    clearCheckResult();
    const order = providers.map((provider) => provider.id);
    setResultOrder(order);
    setOutputs(Object.fromEntries(
      providers.map((provider) => [
        provider.id,
        { label: provider.label, text: "", status: "idle" },
      ]),
    ));
    setIsGenerating(true);

    if (check.enabled) {
      setDiceState("rolling");
      rollStartedAtRef.current = performance.now();
      revealPromiseRef.current = new Promise<void>((resolve) => {
        finishRevealRef.current = resolve;
      });
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, style, providers, check }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `请求失败（${response.status}）`);
      }
      if (!response.body) throw new Error("服务器没有返回内容");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.trim()) processEvent(JSON.parse(line) as RewriteEvent);
        }
        if (done) break;
      }
      if (buffer.trim()) processEvent(JSON.parse(buffer) as RewriteEvent);
      if (revealPromiseRef.current) await revealPromiseRef.current;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setError("生成已停止");
      } else {
        setError(requestError instanceof Error ? requestError.message : "生成失败");
      }
      if (pendingResultRef.current) revealPendingResult();
      else if (check.enabled) setDiceState("idle");
      finishRevealRef.current?.();
      finishRevealRef.current = null;
    } finally {
      revealPromiseRef.current = null;
      abortRef.current = null;
      setIsGenerating(false);
      activeRef.current = false;
    }
  }, [clearCheckResult, processEvent, revealPendingResult]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (pendingResultRef.current) revealPendingResult();
    else setDiceState((current) => current === "rolling" ? "idle" : current);
  }, [revealPendingResult]);

  return {
    outputs,
    resultOrder,
    isGenerating,
    error,
    setError,
    checkResult,
    diceState,
    generate,
    stop,
    clearCheckResult,
  };
}
