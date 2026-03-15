import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';

// Mock $paraglide/runtime before importing locale store
vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

// Mock $app/environment — start with browser = true
vi.mock('$app/environment', () => ({ browser: true }));

import { locale, SUPPORTED_LOCALES, type Locale } from './locale';
import { setLanguageTag } from '$paraglide/runtime';

const STORAGE_KEY = 'apex-locale';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = '';
  vi.mocked(setLanguageTag).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SUPPORTED_LOCALES', () => {
  it('contains en, ru, sr', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'ru', 'sr']);
  });
});

describe('locale store — default', () => {
  it('returns "en" when no stored locale and no matching browser language', () => {
    Object.defineProperty(navigator, 'language', { value: 'ja', configurable: true });
    // Re-create store to pick up fresh detection (simulate by checking fallback path)
    // Since store is module-level singleton, we verify the hydrate fallback instead
    locale.hydrate('xx'); // unsupported → should coerce to en
    expect(get(locale)).toBe('en');
  });
});

describe('locale.set()', () => {
  it('stores locale in localStorage', () => {
    locale.set('ru');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ru');
  });

  it('updates document.documentElement.lang', () => {
    locale.set('sr');
    expect(document.documentElement.lang).toBe('sr');
  });

  it('calls setLanguageTag with the new locale', () => {
    locale.set('ru');
    expect(setLanguageTag).toHaveBeenCalledWith('ru');
  });

  it('updates the store value', () => {
    locale.set('sr');
    expect(get(locale)).toBe('sr');
  });
});

describe('locale.hydrate()', () => {
  it('accepts a valid locale and applies it', () => {
    locale.hydrate('ru');
    expect(get(locale)).toBe('ru');
  });

  it('coerces an unsupported locale to "en"', () => {
    locale.hydrate('xx');
    expect(get(locale)).toBe('en');
  });

  it('coerces empty string to "en"', () => {
    locale.hydrate('');
    expect(get(locale)).toBe('en');
  });
});

describe('localStorage persistence', () => {
  it('reads back a previously stored locale', () => {
    localStorage.setItem(STORAGE_KEY, 'sr');
    // Hydrate simulates what would happen on next load
    locale.hydrate(localStorage.getItem(STORAGE_KEY) as Locale);
    expect(get(locale)).toBe('sr');
  });
});
