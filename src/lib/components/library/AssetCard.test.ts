import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { components } from '$lib/api/types';
import { makeLibraryAssetItem } from '../../../mocks/factories/library';
import { makeMediaObject } from '../../../mocks/factories/media';

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

function renderCard(overrides: Partial<LibraryAssetItem> = {}) {
  const item = makeLibraryAssetItem(overrides);
  const onDelete = vi.fn();
  const onclick = vi.fn();
  const result = render(AssetCard, { props: { item, onclick, onDelete } });
  return { ...result, item, onDelete, onclick };
}

describe('AssetCard', () => {
  it('renders an uploaded asset with the "Uploaded" provenance badge', () => {
    renderCard({ source: 'upload', original_filename: 'photo.jpg', media: makeMediaObject() });
    expect(screen.getByText('Uploaded')).toBeTruthy();
  });

  it('renders a generated asset with the "Generated" provenance badge', () => {
    renderCard({ source: 'output', media: makeMediaObject() });
    expect(screen.getByText('Generated')).toBeTruthy();
  });

  it('calls onclick when the card body is clicked', async () => {
    const { container, onclick } = renderCard({ display_title: 'My asset' });
    const clickTarget = container.querySelector('button[aria-label="My asset"]');
    expect(clickTarget).not.toBeNull();

    await fireEvent.click(clickTarget!);

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('shows the stack indicator only when output_count > 1', () => {
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
});
