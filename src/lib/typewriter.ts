export function typewriterDelay(character: string) {
  const code = character.codePointAt(0) ?? 0;
  const variance = code % 15;
  if (character === "\n") return 160 + (variance % 6) * 20;
  if (character === "】") return 90 + (variance % 5) * 15;
  if (/[。！？!?]/u.test(character)) return 130 + (variance % 7) * 15;
  if (/[，、；：,. ;:]/u.test(character)) return 60 + (variance % 5) * 10;
  if (/[A-Za-z0-9]/u.test(character)) return 18 + (variance % 5) * 3;
  return 24 + (variance % 6) * 3;
}

export function typewriterBatchSize(pending: number) {
  if (pending > 200) return 4 + (pending % 5);
  if (pending >= 80) return 2 + (pending % 3);
  return 1 + (pending % 2);
}

export function takeUnicodeCharacters(value: string, count: number) {
  return Array.from(value).slice(0, count).join("");
}

export class TypewriterQueue {
  private received = "";
  private displayed = "";
  private networkDone = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor(
    private readonly onText: (value: string) => void,
    private readonly onDone: () => void,
    private readonly options: { reducedMotion?: boolean; startDelay?: number } = {},
  ) {}

  receive(value: string) {
    if (this.stopped) return;
    if (Array.from(value).length < Array.from(this.displayed).length) {
      this.displayed = "";
      this.onText("");
    }
    this.received = value;
    if (this.options.reducedMotion) {
      this.displayed = value;
      this.onText(value);
      this.maybeDone();
      return;
    }
    this.schedule(this.started ? 0 : (this.options.startDelay ?? 0));
    this.started = true;
  }

  finish() {
    this.networkDone = true;
    if (this.options.reducedMotion) this.maybeDone();
    else this.schedule(0);
  }

  stop() {
    this.stopped = true;
    this.clear();
  }

  dispose() {
    this.stop();
  }

  snapshot() { return this.displayed; }
  pending() { return Math.max(0, Array.from(this.received).length - Array.from(this.displayed).length); }

  private schedule(delay: number) {
    if (this.timer || this.stopped) return;
    this.timer = setTimeout(() => { this.timer = null; this.tick(); }, delay);
  }

  private tick() {
    if (this.stopped) return;
    const pending = this.pending();
    if (pending === 0) { this.maybeDone(); return; }
    const next = takeUnicodeCharacters(this.received, Array.from(this.displayed).length + typewriterBatchSize(pending));
    const last = Array.from(next).at(-1) || "";
    this.displayed = next;
    this.onText(next);
    this.schedule(typewriterDelay(last));
  }

  private maybeDone() {
    if (this.networkDone && this.pending() === 0 && !this.stopped) this.onDone();
  }

  private clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
