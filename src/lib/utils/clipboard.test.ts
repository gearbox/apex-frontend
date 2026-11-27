import { afterEach, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

it('uses the async clipboard API when available', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  expect(await copyText('exact text\nwith lines')).toBe(true);
  expect(writeText).toHaveBeenCalledWith('exact text\nwith lines');
});

it('falls back to a temporary selected textarea', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  const execCommand = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  expect(await copyText('fallback text')).toBe(true);
  expect(execCommand).toHaveBeenCalledWith('copy');
  expect(document.querySelector('textarea')).toBeNull();
});
