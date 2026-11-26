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

/** Match the default section labels and numbering used by the Suno renderer. */
export function sectionDisplayName(section: PlanSection, allSections: PlanSection[]): string {
  if (section.label != null) return section.label;
  const base = DEFAULT_LABELS[section.kind]();
  if (UNNUMBERED_KINDS.has(section.kind)) return base;
  const sameKind = allSections.filter((item) => item.kind === section.kind);
  if (sameKind.length < 2) return base;
  const position = sameKind.findIndex((item) => item.id === section.id);
  return `${base} ${position < 0 ? sameKind.length : position + 1}`;
}
