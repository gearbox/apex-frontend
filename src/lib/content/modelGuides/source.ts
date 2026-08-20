import { isModelType } from '$lib/utils/generationModes';
import type { components } from '$lib/api/types';
import { modelGuides } from './guides';
import type { ModelGuide } from './types';

type ModelType = components['schemas']['ModelType'];

export interface ModelGuideSource {
  get(modelKey: string): ModelGuide | null;
}

export function createStaticModelGuideSource(
  registry: Readonly<Partial<Record<ModelType, ModelGuide>>>,
): ModelGuideSource {
  return {
    get(modelKey) {
      return isModelType(modelKey) ? (registry[modelKey] ?? null) : null;
    },
  };
}

export const defaultModelGuideSource = createStaticModelGuideSource(modelGuides);
