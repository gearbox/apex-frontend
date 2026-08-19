import * as m from '$paraglide/messages';
import type { GenerationMode } from '$lib/utils/generationModes';

export function modelGuideModeLabel(mode: GenerationMode): string {
  const labels: Record<GenerationMode, () => string> = {
    t2i: m.model_guide_mode_t2i,
    i2i: m.model_guide_mode_i2i,
    t2v: m.model_guide_mode_t2v,
    i2v: m.model_guide_mode_i2v,
    v2v: m.model_guide_mode_v2v,
    flf2v: m.model_guide_mode_flf2v,
  };
  return labels[mode]();
}
