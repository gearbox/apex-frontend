import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SessionProgressBar from './SessionProgressBar.svelte';

describe('SessionProgressBar — determinate', () => {
  it('renders a determinate bar with inline width when progress is a number', () => {
    const { container } = render(SessionProgressBar, {
      props: { status: 'provisioning', progress: 60 },
    });
    const bar = container.querySelector('.progress-bar.determinate') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('60%');
  });

  it('clamps progress to 0–100', () => {
    const { container: c1 } = render(SessionProgressBar, {
      props: { status: 'provisioning', progress: 120 },
    });
    const bar1 = c1.querySelector('.progress-bar.determinate') as HTMLElement;
    expect(bar1.style.width).toBe('100%');

    const { container: c2 } = render(SessionProgressBar, {
      props: { status: 'provisioning', progress: -10 },
    });
    const bar2 = c2.querySelector('.progress-bar.determinate') as HTMLElement;
    expect(bar2.style.width).toBe('0%');
  });
});

describe('SessionProgressBar — indeterminate', () => {
  it('renders an indeterminate bar when progress is null', () => {
    const { container } = render(SessionProgressBar, {
      props: { status: 'provisioning', progress: null },
    });
    expect(container.querySelector('.progress-bar.indeterminate')).not.toBeNull();
    expect(container.querySelector('.progress-bar.determinate')).toBeNull();
  });
});

describe('SessionProgressBar — phase label', () => {
  it('renders a phase label when phase is provided', () => {
    const { container } = render(SessionProgressBar, {
      props: { status: 'provisioning', progress: null, phase: 'downloading' },
    });
    expect(container.querySelector('.phase-label')?.textContent).toBe('downloading');
  });

  it('does not render a phase label when phase is null', () => {
    const { container } = render(SessionProgressBar, {
      props: { status: 'provisioning', progress: null, phase: null },
    });
    expect(container.querySelector('.phase-label')).toBeNull();
  });
});
