import { expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
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
