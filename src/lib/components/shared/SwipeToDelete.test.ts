import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import SwipeToDelete from './SwipeToDelete.svelte';

function makeTouch(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as Touch;
}

function makeTouchEvent(type: string, touches: Touch[]): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: touches });
  return event;
}

function makeCardSnippet(onCardClick: () => void) {
  return createRawSnippet(() => ({
    render: () => '<button type="button">Open gallery item</button>',
    setup: (element) => {
      element.addEventListener('click', onCardClick);
      return () => element.removeEventListener('click', onCardClick);
    },
  }));
}

function renderSwipeToDelete(ondelete = vi.fn(), onCardClick = vi.fn()) {
  const result = render(SwipeToDelete, {
    props: {
      ondelete,
      children: makeCardSnippet(onCardClick),
    },
  });

  const content = result.container.querySelector<HTMLElement>('.swipe-content');
  if (!content) throw new Error('Expected swipe content to render');

  return { ...result, content, ondelete, onCardClick };
}

async function swipeLeft(content: HTMLElement, distance: number) {
  const startX = 200;
  const startY = 100;

  fireEvent(content, makeTouchEvent('touchstart', [makeTouch(startX, startY)]));
  fireEvent(content, makeTouchEvent('touchmove', [makeTouch(startX - distance, startY)]));
  fireEvent(content, makeTouchEvent('touchend', []));
  await tick();
}

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('SwipeToDelete', () => {
  it('keeps the revealed delete action outside the close hit target and deletes once', async () => {
    const { container, content, ondelete } = renderSwipeToDelete();

    await swipeLeft(content, 80);

    const closeOverlay = container.querySelector<HTMLElement>('.swipe-close-overlay');
    const deleteAction = container.querySelector<HTMLElement>('.delete-action');
    expect(closeOverlay).not.toBeNull();
    expect(deleteAction).not.toBeNull();
    expect(closeOverlay?.parentElement).toBe(content);

    fireEvent.click(deleteAction!);
    await tick();

    expect(ondelete).toHaveBeenCalledOnce();
    expect(content.style.transform).toContain('translateX(0px)');
    expect(container.querySelector('.swipe-close-overlay')).toBeNull();
  });

  it('closes an open card without deleting or activating its content', async () => {
    const { container, content, ondelete, onCardClick } = renderSwipeToDelete();

    await swipeLeft(content, 80);

    const closeOverlay = container.querySelector<HTMLElement>('.swipe-close-overlay');
    expect(closeOverlay).not.toBeNull();

    fireEvent.click(closeOverlay!);
    await tick();

    expect(ondelete).not.toHaveBeenCalled();
    expect(onCardClick).not.toHaveBeenCalled();
    expect(content.style.transform).toContain('translateX(0px)');
    expect(container.querySelector('.swipe-close-overlay')).toBeNull();
  });

  it('deletes after an overswipe', async () => {
    const { content, ondelete } = renderSwipeToDelete();

    await swipeLeft(content, 130);

    expect(ondelete).toHaveBeenCalledOnce();
    expect(content.style.transform).toContain('translateX(0px)');
  });

  it('closes another card when a new card is opened', async () => {
    const first = renderSwipeToDelete();
    const second = renderSwipeToDelete();

    await swipeLeft(first.content, 80);
    await swipeLeft(second.content, 80);

    expect(first.content.style.transform).toContain('translateX(0px)');
    expect(second.content.style.transform).toContain('translateX(-80px)');

    const secondCloseOverlay = second.container.querySelector<HTMLElement>('.swipe-close-overlay');
    fireEvent.click(secondCloseOverlay!);
  });
});
