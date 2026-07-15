"use client";

import { useEffect, useRef, useState } from "react";
import { takeUnicodeCharacters, typewriterBatchSize, typewriterDelay } from "@/lib/typewriter";

export function useTypewriterText({
  receivedText,
  networkDone,
  stopped,
  reducedMotion,
  startDelay,
  onComplete,
}: {
  receivedText: string;
  networkDone: boolean;
  stopped: boolean;
  reducedMotion: boolean;
  startDelay: number;
  onComplete: () => void;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const displayedRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (stopped) return;
    if (reducedMotion) {
      displayedRef.current = receivedText;
      if (networkDone) onComplete();
      return;
    }

    const tick = () => {
      const displayedCount = Array.from(displayedRef.current).length;
      const all = Array.from(receivedText);
      const pending = all.length - displayedCount;
      if (pending <= 0) {
        if (networkDone) onComplete();
        return;
      }
      const batch = typewriterBatchSize(pending);
      const next = takeUnicodeCharacters(receivedText, displayedCount + batch);
      const last = Array.from(next).at(-1) || "";
      displayedRef.current = next;
      setDisplayedText(next);
      timerRef.current = setTimeout(tick, typewriterDelay(last));
    };

    timerRef.current = setTimeout(tick, startedRef.current ? 0 : startDelay);
    startedRef.current = true;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [networkDone, onComplete, receivedText, reducedMotion, startDelay, stopped]);

  return reducedMotion ? receivedText : displayedText;
}
