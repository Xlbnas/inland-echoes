"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CheckRequest, CheckResult } from "@/lib/checks-shared";
import type { ProviderOutput, ProviderRequest, RewriteEvent, StyleId } from "@/lib/types";

export type DiceState = "idle" | "rolling" | "resolved";
type ProviderEvent = Exclude<RewriteEvent, { type: "check_resolved" }>;
const MINIMUM_ROLL_MS = 650;

export function useRewriteStream() {
  const [outputs, setOutputs] = useState<Record<string, ProviderOutput>>({});
  const [resultOrder, setResultOrder] = useState<string[]>([]);
  const [networkActive, setNetworkActive] = useState(false);
  const [error, setError] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [diceState, setDiceState] = useState<DiceState>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const rollStartedAtRef = useRef(0);
  const revealTimerRef = useRef<number | null>(null);
  const pendingResultRef = useRef<CheckResult | null>(null);
  const queuedEventsRef = useRef<ProviderEvent[]>([]);
  const finishRevealRef = useRef<(() => void) | null>(null);
  const revealPromiseRef = useRef<Promise<void> | null>(null);

  const applyProviderEvent = useCallback((event: ProviderEvent) => {
    setOutputs((current) => {
      const previous = current[event.providerId] || { label: event.providerId, generation: generationRef.current, receivedText: "", networkDone: false, status: "idle" as const };
      if (event.type === "provider_start") return { ...current, [event.providerId]: { label: event.label, generation: previous.generation, receivedText: "", networkDone: false, status: "streaming" } };
      if (event.type === "provider_delta") return { ...current, [event.providerId]: { ...previous, receivedText: previous.receivedText + event.delta, status: "streaming" } };
      if (event.type === "provider_done") return { ...current, [event.providerId]: { ...previous, networkDone: true, status: "streaming" } };
      return { ...current, [event.providerId]: { ...previous, networkDone: true, status: "error", error: event.message } };
    });
  }, []);

  const markDisplayDone = useCallback((providerId: string) => {
    setOutputs((current) => {
      const output = current[providerId];
      if (!output || output.status !== "streaming" || !output.networkDone) return current;
      return { ...current, [providerId]: { ...output, status: "done" } };
    });
  }, []);

  const revealPendingResult = useCallback(() => {
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
    const result = pendingResultRef.current;
    pendingResultRef.current = null;
    if (result) { setCheckResult(result); setDiceState("resolved"); }
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

  const clearResults = useCallback(() => {
    if (activeRef.current) return;
    setOutputs({});
    setResultOrder([]);
    setError("");
  }, []);

  const processEvent = useCallback((event: RewriteEvent) => {
    if (event.type === "check_resolved") {
      pendingResultRef.current = event.result;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const delay = reduced ? 0 : Math.max(0, MINIMUM_ROLL_MS - (performance.now() - rollStartedAtRef.current));
      revealTimerRef.current = window.setTimeout(revealPendingResult, delay);
    } else if (pendingResultRef.current || revealTimerRef.current !== null) queuedEventsRef.current.push(event);
    else applyProviderEvent(event);
  }, [applyProviderEvent, revealPendingResult]);

  const generate = useCallback(async ({ text, style, providers, check }: { text: string; style: StyleId; providers: ProviderRequest[]; check: CheckRequest }) => {
    if (activeRef.current) return;
    activeRef.current = true;
    generationRef.current += 1;
    const generation = generationRef.current;
    setError("");
    clearCheckResult();
    setResultOrder(providers.map((provider) => provider.id));
    setOutputs(Object.fromEntries(providers.map((provider) => [provider.id, { label: provider.label, generation, receivedText: "", networkDone: false, status: "idle" }])));
    setNetworkActive(true);
    if (check.enabled) {
      setDiceState("rolling");
      rollStartedAtRef.current = performance.now();
      revealPromiseRef.current = new Promise<void>((resolve) => { finishRevealRef.current = resolve; });
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/rewrite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, style, providers, check }), signal: controller.signal });
      if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error || `请求失败（${response.status}）`); }
      if (!response.body) throw new Error("服务器没有返回内容");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) if (line.trim()) processEvent(JSON.parse(line) as RewriteEvent);
        if (done) break;
      }
      if (buffer.trim()) processEvent(JSON.parse(buffer) as RewriteEvent);
      if (revealPromiseRef.current) await revealPromiseRef.current;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") setError("生成已停止");
      else setError(requestError instanceof Error ? requestError.message : "生成失败");
      if (pendingResultRef.current) revealPendingResult(); else if (check.enabled) setDiceState("idle");
    } finally {
      revealPromiseRef.current = null; abortRef.current = null; setNetworkActive(false); activeRef.current = false;
    }
  }, [clearCheckResult, processEvent, revealPendingResult]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setOutputs((current) => Object.fromEntries(Object.entries(current).map(([id, output]) => [id, output.status === "streaming" ? { ...output, networkDone: true, status: "stopped" } : output])));
    setError("生成已停止");
    if (pendingResultRef.current) revealPendingResult(); else setDiceState((current) => current === "rolling" ? "idle" : current);
  }, [revealPendingResult]);

  const isGenerating = useMemo(() => networkActive || Object.values(outputs).some((item) => item.status === "streaming"), [networkActive, outputs]);
  return { outputs, resultOrder, isGenerating, error, setError, checkResult, diceState, generate, stop, clearCheckResult, clearResults, markDisplayDone };
}
