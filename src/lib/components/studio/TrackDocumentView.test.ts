import { expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach } from 'vitest';
import TrackDocumentView from './TrackDocumentView.svelte';
import type { components } from '$lib/api/types';

afterEach(cleanup);

it('renders localized sections, section lyrics, global tags and content omitted from Suno', () => {
  const plan: components['schemas']['PlanDocument'] = {
    title: 'Song',
    idea: 'A note for the writer',
    tempo_bpm: 96,
    instrumental: false,
    global_style: { tags: ['dream pop'], avoid: [] },
    sections: [
      {
        id: 'verse-1',
        kind: 'verse',
        notes: 'Keep the last line quiet',
        delivery: ['soft'],
        instrumental: false,
        style: { tags: ['warm'] },
      },
    ],
    references: [],
  };
  const lyrics: components['schemas']['LyricsDocument'] = {
    language: 'en',
    sections: [{ section_id: 'verse-1', lines: [{ text: 'First line', delivery: ['breathy'] }] }],
  };
  render(TrackDocumentView, { props: { plan, lyrics } });
  expect(screen.getAllByText('Verse')).toHaveLength(2);
  expect(screen.getByText('First line')).toBeTruthy();
  expect(screen.getByText('dream pop')).toBeTruthy();
  expect(screen.getAllByText(/Not sent to Suno/)).toHaveLength(2);
  expect(screen.getByText('Keep the last line quiet')).toBeTruthy();
});

it('renders nothing when there is no plan', () => {
  const { container } = render(TrackDocumentView, { props: { plan: null, lyrics: null } });
  expect(container.querySelector('*')).toBeNull();
  expect(container.textContent).toBe('');
});

it('shows global exclude tags under an Exclude label', () => {
  const plan: components['schemas']['PlanDocument'] = {
    title: 'Song',
    instrumental: false,
    references: [],
    global_style: { tags: [], avoid: ['country', 'heavy metal'] },
    sections: [],
  };
  const { container } = render(TrackDocumentView, { props: { plan, lyrics: null } });
  const exclude = within(container).getByLabelText('Exclude');
  expect(exclude.textContent).toContain('country');
  expect(exclude.textContent).toContain('heavy metal');
});

it('generates unique heading ids for two instances', () => {
  const plan: components['schemas']['PlanDocument'] = {
    title: 'Song',
    instrumental: false,
    references: [],
    sections: [],
  };
  const first = render(TrackDocumentView, { props: { plan, lyrics: null } });
  const second = render(TrackDocumentView, { props: { plan, lyrics: null } });
  const ids = [first.container, second.container].flatMap((container) =>
    Array.from(container.querySelectorAll('h2')).map((heading) => heading.id),
  );
  expect(ids).toHaveLength(4);
  expect(new Set(ids).size).toBe(4);
  expect(ids.filter((id) => id.startsWith('document-plan-heading-'))).toHaveLength(2);
  expect(ids.filter((id) => id.startsWith('document-lyrics-heading-'))).toHaveLength(2);
});
