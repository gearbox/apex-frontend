import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSaveCapabilities, readSaveEnv, type SaveEnv } from './capabilities';

describe('resolveSaveCapabilities', () => {
  const rows: Array<{
    name: string;
    env: SaveEnv;
    expected: ReturnType<typeof resolveSaveCapabilities>;
  }> = [
    {
      name: 'iOS Safari',
      env: { isApple: true, coarsePointer: true, canShareFiles: true, anchorDownload: true },
      expected: ['share'],
    },
    {
      name: 'iPad',
      env: { isApple: true, coarsePointer: true, canShareFiles: true, anchorDownload: true },
      expected: ['share'],
    },
    {
      name: 'Android Chromium',
      env: { isApple: false, coarsePointer: true, canShareFiles: true, anchorDownload: true },
      expected: ['share', 'download'],
    },
    {
      name: 'Android Firefox',
      env: { isApple: false, coarsePointer: true, canShareFiles: false, anchorDownload: true },
      expected: ['download'],
    },
    {
      name: 'desktop Chrome',
      env: { isApple: false, coarsePointer: false, canShareFiles: false, anchorDownload: true },
      expected: ['download'],
    },
    {
      name: 'desktop Safari',
      env: { isApple: false, coarsePointer: false, canShareFiles: true, anchorDownload: true },
      expected: ['download'],
    },
    {
      name: 'SSR',
      env: { isApple: false, coarsePointer: false, canShareFiles: false, anchorDownload: true },
      expected: ['download'],
    },
  ];

  it.each(rows)('$name resolves to $expected', ({ env, expected }) => {
    expect(resolveSaveCapabilities(env)).toEqual(expected);
  });

  it('never returns an empty list, even with no capability detected', () => {
    const env: SaveEnv = {
      isApple: true,
      coarsePointer: false,
      canShareFiles: false,
      anchorDownload: false,
    };
    expect(resolveSaveCapabilities(env)).toEqual(['download']);
  });

  it('sorts share before download when both are available', () => {
    const env: SaveEnv = {
      isApple: false,
      coarsePointer: true,
      canShareFiles: true,
      anchorDownload: true,
    };
    expect(resolveSaveCapabilities(env)).toEqual(['share', 'download']);
  });
});

describe('readSaveEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns the safe, download-only default outside the browser', async () => {
    vi.doMock('$lib/utils/env', () => ({ isBrowser: () => false }));
    const { readSaveEnv: readSaveEnvSsr } = await import('./capabilities');
    expect(readSaveEnvSsr()).toEqual({
      isApple: false,
      coarsePointer: false,
      canShareFiles: false,
      anchorDownload: true,
    });
  });

  it('reads the real environment in the browser', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(pointer: coarse)',
      })),
    });
    const env = readSaveEnv();
    expect(env.coarsePointer).toBe(true);
    expect(env.anchorDownload).toBe(true);
  });
});
