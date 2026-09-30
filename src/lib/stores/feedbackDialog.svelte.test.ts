import { beforeEach, describe, expect, it } from 'vitest';
import { feedbackDialog, openFeedbackDialog } from './feedbackDialog.svelte';

beforeEach(() => feedbackDialog.reset());

describe('feedbackDialog', () => {
  it('opens with global or contextual state and resets it on close', () => {
    openFeedbackDialog();
    expect(feedbackDialog.isOpen).toBe(true);
    expect(feedbackDialog.context).toEqual({});

    feedbackDialog.open({ jobId: 'job-a', assetRef: 'output:a', initialCategory: 'generation' });
    expect(feedbackDialog.context).toEqual({
      jobId: 'job-a',
      assetRef: 'output:a',
      initialCategory: 'generation',
    });
    feedbackDialog.close();
    expect(feedbackDialog).toMatchObject({ isOpen: false, context: {} });
  });

  it('removes only the unavailable reference and clears on a session reset', () => {
    feedbackDialog.open({ jobId: 'job-a', assetRef: 'output:a' });
    feedbackDialog.removeJob();
    expect(feedbackDialog.context).toEqual({ jobId: undefined, assetRef: 'output:a' });
    feedbackDialog.reset();
    expect(feedbackDialog).toMatchObject({ isOpen: false, context: {} });
  });
});
