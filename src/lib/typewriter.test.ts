import { afterEach, describe, expect, it, vi } from "vitest";
import { takeUnicodeCharacters, TypewriterQueue, typewriterBatchSize, typewriterDelay } from "./typewriter";

afterEach(() => vi.useRealTimers());

describe("typewriter primitives", () => {
  it("never splits Unicode surrogate pairs", () => expect(takeUnicodeCharacters("甲😀乙", 2)).toBe("甲😀"));
  it("uses longer sentence-punctuation delay", () => expect(typewriterDelay("。")).toBeGreaterThan(typewriterDelay("甲")));
  it("uses longer newline than closing-label delay", () => expect(typewriterDelay("\n")).toBeGreaterThan(typewriterDelay("】")));
  it("uses longer closing-label than Latin delay", () => expect(typewriterDelay("】")).toBeGreaterThan(typewriterDelay("A")));
  it("increases deterministic batches as the queue grows", () => {
    expect(typewriterBatchSize(20)).toBeLessThan(typewriterBatchSize(100));
    expect(typewriterBatchSize(100)).toBeLessThan(typewriterBatchSize(240));
  });
});

describe("TypewriterQueue", () => {
  it("does not complete until network and queue are both done", () => {
    vi.useFakeTimers(); const done = vi.fn(); const queue = new TypewriterQueue(() => {}, done);
    queue.receive("甲乙"); queue.finish(); expect(done).not.toHaveBeenCalled(); vi.runAllTimers(); expect(done).toHaveBeenCalledTimes(1);
  });
  it("keeps independent provider queues", () => {
    vi.useFakeTimers(); const a = new TypewriterQueue(() => {}, vi.fn()); const b = new TypewriterQueue(() => {}, vi.fn(), { startDelay: 120 });
    a.receive("甲乙"); b.receive("丙丁"); vi.advanceTimersByTime(1); expect(a.snapshot()).not.toBe(""); expect(b.snapshot()).toBe("");
  });
  it("stop preserves displayed text and prevents completion", () => {
    vi.useFakeTimers(); const done = vi.fn(); const queue = new TypewriterQueue(() => {}, done);
    queue.receive("甲乙丙"); vi.advanceTimersByTime(1); const visible = queue.snapshot(); queue.stop(); queue.finish(); vi.runAllTimers(); expect(queue.snapshot()).toBe(visible); expect(done).not.toHaveBeenCalled();
  });
  it("reduced motion displays immediately", () => {
    const done = vi.fn(); const queue = new TypewriterQueue(() => {}, done, { reducedMotion: true }); queue.receive("甲😀乙"); queue.finish(); expect(queue.snapshot()).toBe("甲😀乙"); expect(done).toHaveBeenCalled();
  });
  it("catch-up consumes multiple characters from a long queue", () => {
    vi.useFakeTimers(); const queue = new TypewriterQueue(() => {}, vi.fn()); queue.receive("字".repeat(240)); vi.advanceTimersByTime(1); expect(Array.from(queue.snapshot()).length).toBeGreaterThanOrEqual(4);
  });
  it("dispose clears scheduled work", () => {
    vi.useFakeTimers(); const onText = vi.fn(); const queue = new TypewriterQueue(onText, vi.fn(), { startDelay: 100 }); queue.receive("甲"); queue.dispose(); vi.runAllTimers(); expect(onText).not.toHaveBeenCalled();
  });
  it("a shorter replacement resets stale displayed content", () => {
    vi.useFakeTimers(); const queue = new TypewriterQueue(() => {}, vi.fn()); queue.receive("甲乙丙丁"); vi.runAllTimers(); queue.receive("新"); vi.runAllTimers(); expect(queue.snapshot()).toBe("新");
  });
});
