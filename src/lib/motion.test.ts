import { describe, expect, it } from "vitest";
import {
  MECHANICAL_SPRING,
  MOTION_DURATION,
  MOTION_EASE,
  disclosureVariants,
} from "./motion";

describe("motion system", () => {
  it("keeps the shared timing scale ordered and restrained", () => {
    expect([
      MOTION_DURATION.instant,
      MOTION_DURATION.fast,
      MOTION_DURATION.base,
      MOTION_DURATION.slow,
      MOTION_DURATION.intro,
    ]).toEqual([0.09, 0.15, 0.24, 0.42, 0.76]);
  });

  it("uses the specified entry, exit, and mechanical spring curves", () => {
    expect(MOTION_EASE.enter).toEqual([0.16, 1, 0.3, 1]);
    expect(MOTION_EASE.exit).toEqual([0.7, 0, 0.84, 0]);
    expect(MECHANICAL_SPRING).toMatchObject({
      type: "spring",
      stiffness: 470,
      damping: 32,
      mass: 0.8,
    });
  });

  it("defines interruptible disclosure end states without arbitrary max height", () => {
    expect(disclosureVariants.closed).toMatchObject({ height: 0, opacity: 0 });
    expect(disclosureVariants.open).toMatchObject({ height: "auto", opacity: 1 });
  });
});
