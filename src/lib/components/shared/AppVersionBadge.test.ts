import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import AppVersionBadge from './AppVersionBadge.svelte';
import { APP_VERSION_LABEL } from '$lib/utils/appVersion';

describe('AppVersionBadge', () => {
  it('renders the build version label', () => {
    const { getByTestId } = render(AppVersionBadge);
    const el = getByTestId('app-version');
    expect(el).toBeTruthy();
    expect(el.textContent?.trim()).toBe(APP_VERSION_LABEL);
    expect(el.textContent?.trim()).toMatch(/^v\d+\.\d+\.\d+ · \S+$/);
  });
});
