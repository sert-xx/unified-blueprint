/**
 * File-level debouncer
 * Deduplicates rapid file change events on a per-file basis.
 */

export class Debouncer {
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly delayMs: number;

  constructor(delayMs: number = 500) {
    this.delayMs = delayMs;
  }

  /**
   * Debounce a callback per key.
   * Repeated calls within delayMs reset the timer.
   */
  debounce(key: string, callback: () => void): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      callback();
    }, this.delayMs);

    this.timers.set(key, timer);
  }

  /** Clear all pending timers */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /** Number of pending debounced callbacks */
  get pendingCount(): number {
    return this.timers.size;
  }
}
