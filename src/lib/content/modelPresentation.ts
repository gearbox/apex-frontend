import { generationTypeValues } from '$lib/api/types';
import { generationModeLabel } from './generationModeLabels';
import { isVideoMode } from '$lib/utils/generationModes';
import type { GenerationMode } from '$lib/stores/generation';
import * as m from '$paraglide/messages';

interface ModelPresentation {
  readonly label: string;
  readonly icon: string;
}

const MODEL_PRESENTATION: Readonly<Record<string, ModelPresentation>> = {
  'wan3.0-video': { label: 'Wan 3.0', icon: '◇▶' },
  'grok-imagine-image': { label: 'Grok Imagine', icon: '✦' },
  'grok-2-image-1212': { label: 'Grok 2', icon: '◈' },
  'grok-imagine-video': { label: 'Grok Video', icon: '▶' },
  'aisha-image': { label: 'Aisha', icon: '◆' },
  'aisha-image-lite': { label: 'Aisha Lite', icon: '◆' },
  'aisha-video': { label: 'Aisha Video', icon: '◆▶' },
};

/** Resolves model names centrally and uses discovery names for newly added models. */
export function modelPresentation(key: string, discoveredName?: string | null): ModelPresentation {
  const model = MODEL_PRESENTATION[key];
  if (model) return model;

  if ((generationTypeValues as readonly string[]).includes(key)) {
    const mode = key as GenerationMode;
    return { label: generationModeLabel(mode), icon: isVideoMode(mode) ? '▶' : '✦' };
  }

  return { label: discoveredName?.trim() || m.billing_unknown_model(), icon: '◆' };
}
