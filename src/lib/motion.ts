import type { Transition, Variants } from "motion/react";

export const MOTION_DURATION = {
  instant: 0.09,
  fast: 0.15,
  base: 0.24,
  slow: 0.42,
  intro: 0.76,
} as const;

export const MOTION_EASE = {
  enter: [0.16, 1, 0.3, 1],
  exit: [0.7, 0, 0.84, 0],
} as const;

export const MECHANICAL_SPRING: Transition = {
  type: "spring",
  stiffness: 470,
  damping: 32,
  mass: 0.8,
};

export const pageIntroVariants: Variants = {
  hidden: {},
  visible: {},
};

export const introRailVariants: Variants = {
  hidden: { opacity: 0.2, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: MOTION_DURATION.slow, delay: 0.1, ease: MOTION_EASE.enter },
  },
};

export const introRailLineVariants: Variants = {
  hidden: { scaleY: 0, opacity: 0 },
  visible: {
    scaleY: 1,
    opacity: 1,
    transition: { duration: 0.32, delay: 0.16, ease: MOTION_EASE.enter },
  },
};

export const introRailMarkVariants: Variants = {
  hidden: { scaleX: 0.92, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: MOTION_DURATION.base, delay: 0.28, ease: MOTION_EASE.enter },
  },
};

export const introRailChannelVariants: Variants = {
  hidden: { opacity: 0.22 },
  visible: (index: number) => ({
    opacity: 1,
    transition: {
      duration: MOTION_DURATION.fast,
      delay: 0.2 + index * 0.04,
      ease: MOTION_EASE.enter,
    },
  }),
};

export const introEyebrowVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, delay: 0.18, ease: MOTION_EASE.enter },
  },
};

export const introTitleVariants: Variants = {
  hidden: { opacity: 0, y: 16, clipPath: "inset(100% 0 0 0)" },
  visible: {
    opacity: 1,
    y: 0,
    clipPath: "inset(0% 0 0 0)",
    transition: { duration: MOTION_DURATION.slow, delay: 0.24, ease: MOTION_EASE.enter },
  },
};

export const introNoteVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, delay: 0.48, ease: MOTION_EASE.enter },
  },
};

export const introControlsVariants: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.36, staggerChildren: 0.055 } },
};

export const introControlItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.enter },
  },
};

export const introCheckVariants: Variants = {
  hidden: { opacity: 0, y: 10, rotate: -0.15 },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: { duration: MOTION_DURATION.slow, delay: 0.56, ease: MOTION_EASE.enter },
  },
};

export const introSurfaceVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, delay: 0.64, ease: MOTION_EASE.enter },
  },
};

export const introSurfacePartVariants: Variants = {
  hidden: { opacity: 0 },
  visible: (index: number) => ({
    opacity: 1,
    transition: {
      duration: MOTION_DURATION.base,
      delay: 0.78 + index * 0.08,
      ease: MOTION_EASE.enter,
    },
  }),
};

export const introActionVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, delay: 0.86, ease: MOTION_EASE.enter },
  },
};

export const disclosureVariants: Variants = {
  closed: {
    height: 0,
    opacity: 0,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.exit },
  },
  open: {
    height: "auto",
    opacity: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.enter },
  },
};
