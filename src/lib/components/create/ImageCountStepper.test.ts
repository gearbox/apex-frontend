import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ImageCountStepper from './ImageCountStepper.svelte';
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';

describe('ImageCountStepper', () => {
  it('uses the backend max_images without a hidden cap of ten', () => {
    render(ImageCountStepper, { modelInfo: makeGrokImageModelInfo({ max_images: 12 }) });
    expect(screen.getByRole('button', { name: '12' })).toBeTruthy();
  });
});
