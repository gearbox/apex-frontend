import type { components } from '$lib/api/types';
import * as m from '$paraglide/messages';

type PlanSection = components['schemas']['PlanSection'];
type SectionKind = components['schemas']['StudioSectionKind'];

const DEFAULT_LABELS: Record<SectionKind, () => string> = {
  intro: m.studio_section_kind_intro,
  verse: m.studio_section_kind_verse,
  pre_chorus: m.studio_section_kind_pre_chorus,
  chorus: m.studio_section_kind_chorus,
  post_chorus: m.studio_section_kind_post_chorus,
  hook: m.studio_section_kind_hook,
  bridge: m.studio_section_kind_bridge,
  build: m.studio_section_kind_build,
  drop: m.studio_section_kind_drop,
  breakdown: m.studio_section_kind_breakdown,
  instrumental: m.studio_section_kind_instrumental,
  interlude: m.studio_section_kind_interlude,
  outro: m.studio_section_kind_outro,
};

const UNNUMBERED_KINDS = new Set<SectionKind>(['chorus', 'pre_chorus', 'post_chorus', 'hook']);
const SUNO_LABELS: Record<SectionKind, () => string> = {
  intro: () => 'Intro',
  verse: () => 'Verse',
  pre_chorus: () => 'Pre-Chorus',
  chorus: () => 'Chorus',
  post_chorus: () => 'Post-Chorus',
  hook: () => 'Hook',
  bridge: () => 'Bridge',
  build: () => 'Build',
  drop: () => 'Drop',
  breakdown: () => 'Breakdown',
  instrumental: () => 'Instrumental',
  interlude: () => 'Interlude',
  outro: () => 'Outro',
};

function sectionName(
  section: PlanSection,
  allSections: PlanSection[],
  names: Record<SectionKind, () => string>,
): string {
  if (section.label != null) return section.label;
  const base = names[section.kind]();
  if (UNNUMBERED_KINDS.has(section.kind)) return base;
  const sameKind = allSections.filter((item) => item.kind === section.kind);
  if (sameKind.length < 2) return base;
  const position = sameKind.findIndex((item) => item.id === section.id);
  return `${base} ${position < 0 ? sameKind.length : position + 1}`;
}

/** Match the localized section labels and numbering used by the document view. */
export function sectionDisplayName(section: PlanSection, allSections: PlanSection[]): string {
  return sectionName(section, allSections, DEFAULT_LABELS);
}

/** Match the English section name and numbering used in Suno export headers. */
export function sunoSectionName(section: PlanSection, allSections: PlanSection[]): string {
  return sectionName(section, allSections, SUNO_LABELS);
}
