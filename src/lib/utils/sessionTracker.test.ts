import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import { createSessionTracker, type Session, type SessionTracker } from './sessionTracker';
import Harness from './SessionTrackerHarness.svelte';

describe('session tracker', () => {
  it('invalidates old captures and keeps new captures active', () => {
    const tracker: SessionTracker = createSessionTracker();
    const first = tracker.capture();
    expect(first.active).toBe(true);
    tracker.invalidate();
    expect(first.active).toBe(false);
    expect(tracker.capture().active).toBe(true);
  });
  it('componentSession invalidates on destroy', () => {
    let session: Session | undefined;
    const view = render(Harness, {
      props: {
        capture: (value: Session) => {
          session = value;
        },
      },
    });
    expect(session?.active).toBe(true);
    view.unmount();
    expect(session?.active).toBe(false);
  });
});
