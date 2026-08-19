import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';

type ModelType = components['schemas']['ModelType'];
type AspectRatio = components['schemas']['AspectRatio'];

/** Read at render time so the active Paraglide locale is always respected. */
export type LocalizedText = () => string;

export interface ModelGuideExample {
  /** Raw model input — never localized. */
  readonly prompt: string;
  readonly mode: GenerationMode;
  readonly aspectRatio: AspectRatio;
  /** Optional static sample asset under /model-guides/<model-key>/. */
  readonly image?: string;
}

export interface ModelGuide {
  readonly modelKey: ModelType;
  readonly tagline: LocalizedText;
  readonly goodAt: readonly LocalizedText[];
  readonly chooseWhen: readonly LocalizedText[];
  readonly restrictions: readonly LocalizedText[];
  /** Rules only. Never token amounts. */
  readonly billingRules: readonly LocalizedText[];
  readonly promptTips: readonly LocalizedText[];
  readonly examples: readonly ModelGuideExample[];
}
