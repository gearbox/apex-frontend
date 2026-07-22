import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { components } from '$lib/api/types';
import { makeLibraryAssetItem } from '../../../mocks/factories/library';
import { makeMediaObject, makeVideoMediaObject } from '../../../mocks/factories/media';

type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
type LibraryAction = components['schemas']['LibraryAction'];

const mutateMock = vi.fn();

vi.mock('@tanstack/svelte-query', () => ({
  createMutation: vi.fn(() => ({
    mutate: mutateMock,
    get isPending() {
      return false;
    },
  })),
  useQueryClient: vi.fn(() => ({})),
}));

import AssetCard from './AssetCard.svelte';

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true, // desktop — enables ContextMenu's right-click handler
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mutateMock.mockClear();
});

function renderCard(
  overrides: Partial<LibraryAssetItem> = {},
  extraProps: Record<string, unknown> = {},
) {
  const item = makeLibraryAssetItem(overrides);
  const onDelete = vi.fn();
  const onclick = vi.fn();
  const result = render(AssetCard, { props: { item, onclick, onDelete, ...extraProps } });
  return { ...result, item, onDelete, onclick };
}

describe('AssetCard', () => {
  it('renders an image icon and "Uploaded" in the uploaded-image provenance badge', () => {
    renderCard({ source: 'upload', original_filename: 'photo.jpg', media: makeMediaObject() });
    expect(screen.getByText('Uploaded')).toBeTruthy();
    expect(screen.getByTestId('library-media-icon-image').getAttribute('aria-hidden')).toBe('true');
  });

  it('renders an image icon and "Generated" in the generated-image provenance badge', () => {
    renderCard({ source: 'output', media: makeMediaObject() });
    expect(screen.getByText('Generated')).toBeTruthy();
    expect(screen.getByTestId('library-media-icon-image').getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a video icon and "Generated" in the generated-video provenance badge', () => {
    renderCard({ source: 'output', media: makeVideoMediaObject() });
    expect(screen.getByText('Generated')).toBeTruthy();
    expect(screen.getByTestId('library-media-icon-video').getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a video icon and "Uploaded" in the uploaded-video provenance badge', () => {
    renderCard({ source: 'upload', media: makeVideoMediaObject() });
    expect(screen.getByText('Uploaded')).toBeTruthy();
    expect(screen.getByTestId('library-media-icon-video').getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a selection control when onToggleSelect is supplied', () => {
    renderCard({}, { onToggleSelect: vi.fn() });

    expect(screen.getByTestId('library-selection-control').getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByTestId('library-selection-unchecked').getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('toggles exactly once without opening the card when its selection control is clicked', async () => {
    const onToggleSelect = vi.fn();
    const { item, onclick } = renderCard({}, { onToggleSelect });

    await fireEvent.click(screen.getByTestId('library-selection-control'));

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(item);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('exposes selected state and a check indicator on the selection control', () => {
    renderCard({}, { onToggleSelect: vi.fn(), selected: true });

    expect(screen.getByTestId('library-selection-control').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('library-selection-check').getAttribute('aria-hidden')).toBe('true');
  });

  it('does not start a delayed long-press toggle from the explicit selection control', async () => {
    const onToggleSelect = vi.fn();
    renderCard({}, { onToggleSelect });
    const control = screen.getByTestId('library-selection-control');

    await fireEvent.touchStart(control, { touches: [{ clientX: 10, clientY: 10 }] });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await fireEvent.touchEnd(control);
    await fireEvent.click(control);

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onclick when the card body is clicked', async () => {
    const { container, onclick } = renderCard({ display_title: 'My asset' });
    const clickTarget = container.querySelector('button[aria-label="My asset"]');
    expect(clickTarget).not.toBeNull();

    await fireEvent.click(clickTarget!);

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('hides the stack indicator when output_count is 1', () => {
    renderCard({ output_count: 1 });
    expect(screen.queryByText(/×\d/)).toBeNull();
  });

  it('shows the stack indicator when output_count > 1', () => {
    renderCard({ output_count: 3 });
    expect(screen.getByText('×3')).toBeTruthy();
  });

  it('shows the video duration chip when duration_ms is present', () => {
    renderCard({
      media: { ...makeMediaObject(), media_type: 'video' },
      duration_ms: 75_000,
    });
    expect(screen.getByText('01:15')).toBeTruthy();
  });

  it('renders exactly the actions present in available_actions and hides the rest', async () => {
    const limitedActions: LibraryAction[] = ['favorite', 'download'];
    const { container } = renderCard({ available_actions: limitedActions });

    const wrapper = container.querySelector('[role="presentation"]');
    expect(wrapper).not.toBeNull();
    await fireEvent.contextMenu(wrapper!, { clientX: 10, clientY: 10 });

    // Only wired actions for this asset should render as menu items.
    expect(screen.getByRole('menuitem', { name: /favorite/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /download/i })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /delete/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /rename/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /remix/i })).toBeNull();
  });

  it('toggles favorite optimistically via the mutation — see library.test.ts for rollback', async () => {
    const { getByLabelText, item } = renderCard({ is_favorite: false });

    await fireEvent.click(getByLabelText('Favorite'));

    expect(mutateMock).toHaveBeenCalledWith({ assetRef: item.asset_ref, favorite: true });
  });

  it('hides the favorite heart when "favorite" is not in available_actions', () => {
    renderCard({ available_actions: ['download', 'delete'] });
    expect(screen.queryByLabelText('Favorite')).toBeNull();
    expect(screen.queryByLabelText('Unfavorite')).toBeNull();
  });

  it('renders rename/view_settings/extract_frame menu entries only when both the callback is provided and the action is available', async () => {
    const onRename = vi.fn();
    const onExtractFrame = vi.fn();
    const onViewSettings = vi.fn();
    const { container, item } = renderCard(
      { available_actions: ['rename', 'view_settings', 'extract_frame', 'delete'] },
      { onRename, onExtractFrame, onViewSettings },
    );

    const wrapper = container.querySelector('[role="presentation"]');

    // The menu closes itself after each item click, so it's reopened before each assertion.
    await fireEvent.contextMenu(wrapper!, { clientX: 10, clientY: 10 });
    await fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));
    expect(onRename).toHaveBeenCalledWith(item);

    await fireEvent.contextMenu(wrapper!, { clientX: 10, clientY: 10 });
    await fireEvent.click(screen.getByRole('menuitem', { name: /view settings/i }));
    expect(onViewSettings).toHaveBeenCalledWith(item);

    await fireEvent.contextMenu(wrapper!, { clientX: 10, clientY: 10 });
    await fireEvent.click(screen.getByRole('menuitem', { name: /extract/i }));
    expect(onExtractFrame).toHaveBeenCalledWith(item);
  });

  it('omits rename/view_settings/extract_frame menu entries when no callback is passed, even if the action is available', async () => {
    const { container } = renderCard({
      available_actions: ['rename', 'view_settings', 'extract_frame', 'download'],
    });

    const wrapper = container.querySelector('[role="presentation"]');
    await fireEvent.contextMenu(wrapper!, { clientX: 10, clientY: 10 });

    expect(screen.queryByRole('menuitem', { name: /rename/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /view settings/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /extract/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /download/i })).toBeTruthy();
  });

  it('opens the overflow menu via ContextMenu.openAt instead of a synthetic contextmenu dispatch', async () => {
    const { container, getByLabelText } = renderCard({ available_actions: ['download'] });

    await fireEvent.click(getByLabelText('More actions'));

    expect(container.querySelector('.context-menu')).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: /download/i })).toBeTruthy();
  });
});
