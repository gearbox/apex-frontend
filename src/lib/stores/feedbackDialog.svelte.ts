import type { FeedbackCategory } from '$lib/api/feedback';

export interface FeedbackDialogContext {
  jobId?: string;
  assetRef?: string;
  initialCategory?: FeedbackCategory;
}

/** One ephemeral owner for the report dialog, shared by unrelated app surfaces. */
class FeedbackDialogStore {
  isOpen = $state(false);
  context = $state<FeedbackDialogContext>({});

  open(context: FeedbackDialogContext = {}): void {
    this.context = { ...context };
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.context = {};
  }

  removeJob(): void {
    this.context = { ...this.context, jobId: undefined };
  }

  removeAsset(): void {
    this.context = { ...this.context, assetRef: undefined };
  }

  reset(): void {
    this.isOpen = false;
    this.context = {};
  }
}

export const feedbackDialog = new FeedbackDialogStore();

export function openFeedbackDialog(context: FeedbackDialogContext = {}): void {
  feedbackDialog.open(context);
}
