"use client";

import { useLayoutEffect, useState } from "react";
import { m, useAnimationControls, useReducedMotion } from "motion/react";
import { pageIntroVariants } from "@/lib/motion";

type IntroState = "idle" | "entering" | "entered";

export function PageIntro({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimationControls();
  const [introState, setIntroState] = useState<IntroState>("idle");

  useLayoutEffect(() => {
    if (reduceMotion) {
      const frame = window.requestAnimationFrame(() => {
        controls.set("visible");
        setIntroState("entered");
      });

      return () => window.cancelAnimationFrame(frame);
    }

    controls.set("hidden");
    const frame = window.requestAnimationFrame(() => {
      setIntroState("entering");
      void controls.start("visible").then(() => setIntroState("entered"));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [controls, reduceMotion]);

  return (
    <m.main
      className="shell"
      id="main-content"
      initial={false}
      animate={controls}
      variants={pageIntroVariants}
      data-motion-state={introState}
    >
      {children}
    </m.main>
  );
}
