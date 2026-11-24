import * as m from '$paraglide/messages';

export const ARTIST_KINDS = [
  'you',
  'human',
  'creature',
  'alien',
  'machine',
  'spirit',
  'other',
] as const;

export type ArtistKind = (typeof ARTIST_KINDS)[number];

export const ARTIST_KIND_COPY: Record<
  ArtistKind,
  { label: () => string; template: () => string; namePlaceholder: () => string }
> = {
  you: {
    label: () => m.artist_kind_you_label(),
    template: () => m.artist_kind_you_template(),
    namePlaceholder: () => m.artist_kind_you_name(),
  },
  human: {
    label: () => m.artist_kind_human_label(),
    template: () => m.artist_kind_human_template(),
    namePlaceholder: () => m.artist_kind_human_name(),
  },
  creature: {
    label: () => m.artist_kind_creature_label(),
    template: () => m.artist_kind_creature_template(),
    namePlaceholder: () => m.artist_kind_creature_name(),
  },
  alien: {
    label: () => m.artist_kind_alien_label(),
    template: () => m.artist_kind_alien_template(),
    namePlaceholder: () => m.artist_kind_alien_name(),
  },
  machine: {
    label: () => m.artist_kind_machine_label(),
    template: () => m.artist_kind_machine_template(),
    namePlaceholder: () => m.artist_kind_machine_name(),
  },
  spirit: {
    label: () => m.artist_kind_spirit_label(),
    template: () => m.artist_kind_spirit_template(),
    namePlaceholder: () => m.artist_kind_spirit_name(),
  },
  other: {
    label: () => m.artist_kind_other_label(),
    template: () => m.artist_kind_other_template(),
    namePlaceholder: () => m.artist_kind_other_name(),
  },
};
