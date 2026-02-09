import { describe, it, expect, vi, afterEach } from 'vitest';
import { Debouncer } from './debouncer.js';

describe('Debouncer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls callback after delay', async () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const debouncer = new Debouncer(100);

    debouncer.debounce('key1', cb);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    debouncer.clear();
  });

  it('resets timer on repeated calls', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const debouncer = new Debouncer(100);

    debouncer.debounce('key1', cb);
    vi.advanceTimersByTime(50);
    debouncer.debounce('key1', cb); // reset
    vi.advanceTimersByTime(50);
    expect(cb).not.toHaveBeenCalled(); // not yet

    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(1);
    debouncer.clear();
  });

  it('handles different keys independently', () => {
    vi.useFakeTimers();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const debouncer = new Debouncer(100);

    debouncer.debounce('key1', cb1);
    debouncer.debounce('key2', cb2);

    vi.advanceTimersByTime(100);
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    debouncer.clear();
  });

  it('reports pending count correctly', () => {
    vi.useFakeTimers();
    const debouncer = new Debouncer(100);

    debouncer.debounce('a', () => {});
    debouncer.debounce('b', () => {});
    expect(debouncer.pendingCount).toBe(2);

    vi.advanceTimersByTime(100);
    expect(debouncer.pendingCount).toBe(0);
    debouncer.clear();
  });

  it('clears all pending timers', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const debouncer = new Debouncer(100);

    debouncer.debounce('key1', cb);
    debouncer.debounce('key2', cb);
    debouncer.clear();

    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
    expect(debouncer.pendingCount).toBe(0);
  });
});
