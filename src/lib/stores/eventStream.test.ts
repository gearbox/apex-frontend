import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { eventStreamStatus, isSSEConnected, isSSEFallback, setEventStreamStatus } from './eventStream';

function getValue<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
  let value!: T;
  const unsub = store.subscribe((v) => (value = v));
  unsub();
  return value;
}

beforeEach(() => {
  setEventStreamStatus('disconnected');
});

describe('setEventStreamStatus()', () => {
  it('updates the eventStreamStatus store', () => {
    setEventStreamStatus('connected');
    expect(getValue(eventStreamStatus)).toBe('connected');

    setEventStreamStatus('fallback');
    expect(getValue(eventStreamStatus)).toBe('fallback');

    setEventStreamStatus('connecting');
    expect(getValue(eventStreamStatus)).toBe('connecting');

    setEventStreamStatus('disconnected');
    expect(getValue(eventStreamStatus)).toBe('disconnected');
  });
});

describe('isSSEConnected', () => {
  it('is true only when status is connected', () => {
    setEventStreamStatus('connected');
    expect(get(isSSEConnected)).toBe(true);

    setEventStreamStatus('connecting');
    expect(get(isSSEConnected)).toBe(false);

    setEventStreamStatus('fallback');
    expect(get(isSSEConnected)).toBe(false);

    setEventStreamStatus('disconnected');
    expect(get(isSSEConnected)).toBe(false);
  });
});

describe('isSSEFallback', () => {
  it('is true only when status is fallback', () => {
    setEventStreamStatus('fallback');
    expect(get(isSSEFallback)).toBe(true);

    setEventStreamStatus('connected');
    expect(get(isSSEFallback)).toBe(false);

    setEventStreamStatus('disconnected');
    expect(get(isSSEFallback)).toBe(false);
  });
});
