import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createStore = <T>(initial: T) => {
    let value = initial;
    const subscribers = new Set<(next: T) => void>();
    return {
      subscribe(subscriber: (next: T) => void) {
        subscribers.add(subscriber);
        subscriber(value);
        return () => subscribers.delete(subscriber);
      },
      set(next: T) {
        value = next;
        subscribers.forEach((subscriber) => subscriber(value));
      },
    };
  };
  const status = createStore({
    state: 'idle',
    targetBuildSha: undefined as string | undefined,
    dismissed: false,
  });
  return {
    status,
    apply: vi.fn().mockResolvedValue(true),
    dismiss: vi.fn(),
    dirty: createStore(false),
  };
});

vi.mock('$lib/services/pwaUpdate', () => ({
  pwaUpdateStatus: mocks.status,
  applyPwaUpdate: mocks.apply,
  dismissPwaUpdatePrompt: mocks.dismiss,
}));

vi.mock('$lib/services/appDirty', () => ({ appIsDirty: mocks.dirty }));

import AppUpdatePrompt from './AppUpdatePrompt.svelte';

describe('AppUpdatePrompt', () => {
  beforeEach(() => {
    mocks.status.set({ state: 'idle', targetBuildSha: undefined, dismissed: false });
    mocks.dirty.set(false);
    vi.clearAllMocks();
  });

  it('shows an accessible clean-update action and lets the user defer it', async () => {
    mocks.status.set({ state: 'reload-required', targetBuildSha: 'next456', dismissed: false });
    const { getByTestId, getByRole } = render(AppUpdatePrompt);

    expect(getByTestId('app-update-prompt').getAttribute('aria-live')).toBe('polite');
    await fireEvent.click(getByRole('button', { name: 'Update now' }));
    expect(mocks.apply).toHaveBeenCalledTimes(1);

    await fireEvent.click(getByRole('button', { name: 'Later' }));
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
  });

  it('warns about dirty state and requires activation to finish before update is enabled', async () => {
    mocks.dirty.set(true);
    mocks.status.set({ state: 'reload-required', targetBuildSha: 'next456', dismissed: false });
    const { getByText, getByRole } = render(AppUpdatePrompt);

    expect(getByText(/may discard unsaved changes/i)).toBeTruthy();
    expect((getByRole('button', { name: 'Update anyway' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    mocks.status.set({ state: 'activating', targetBuildSha: 'next456', dismissed: false });
    await tick();
    expect((getByRole('button', { name: 'Update anyway' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
