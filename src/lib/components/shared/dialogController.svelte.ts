import { tick } from 'svelte';

export interface DialogControllerOptions {
  /** Whether the dialog may currently be dismissed (Escape, backdrop click, or the close control). */
  canClose: () => boolean;
  /** Element to focus once the dialog opens. Falls back to the dialog itself. */
  initialFocus?: () => HTMLElement | null | undefined;
  /** Invoked once a dismissal request is actually granted by `canClose()`. */
  onClose: () => void;
}

/**
 * A native `<dialog>`'s own click handler receives `event.currentTarget === event.target` for
 * clicks on the dialog's own padding, gaps, or scrollbar — not just the `::backdrop` — because the
 * dialog element IS the content box. Geometry against the dialog's rendered rect is the only
 * reliable way to tell a real backdrop click from one inside the dialog.
 */
export function isDialogBackdropClick(dialog: HTMLDialogElement, event: MouseEvent): boolean {
  // A keyboard-activated click (e.g. Enter/Space on a focused control) reports (0,0); never treat
  // that as a backdrop hit.
  if (event.clientX === 0 && event.clientY === 0) return false;

  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

/**
 * Shared lifecycle for the app's native `<dialog>`-based modals: open/focus capture, initial
 * focus, Escape/backdrop dismissal gated on `canClose()`, focus restoration, and teardown. Bind
 * `dialog` to the `<dialog>` element and wire `handleCancel`/`handleBackdropClick` to its
 * `oncancel`/`onclick`; call `open()` from `onMount` (its return value is the cleanup function).
 */
export class DialogController {
  dialog = $state<HTMLDialogElement>();
  #options: DialogControllerOptions;
  #previousFocus: HTMLElement | null = null;

  constructor(options: DialogControllerOptions) {
    this.#options = options;
  }

  requestClose = (): void => {
    if (this.#options.canClose()) this.#options.onClose();
  };

  handleCancel = (event: Event): void => {
    event.preventDefault();
    this.requestClose();
  };

  handleBackdropClick = (event: MouseEvent): void => {
    const dialogEl = event.currentTarget;
    if (dialogEl instanceof HTMLDialogElement && isDialogBackdropClick(dialogEl, event)) {
      this.requestClose();
    }
  };

  /** Call from `onMount`; returns the teardown function `onMount` expects back. */
  open = (): (() => void) => {
    this.#previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialogEl = this.dialog;
    // `showModal()` supplies the top-layer, inert background, and native focus behavior. jsdom
    // does not implement it, so the open fallback only keeps component tests representable.
    if (dialogEl?.showModal) dialogEl.showModal();
    else if (dialogEl) dialogEl.open = true;

    void tick().then(() => {
      const target = this.#options.initialFocus?.() ?? this.dialog;
      target?.focus({ preventScroll: true });
    });

    return () => {
      if (this.dialog?.open) this.dialog.close?.();
      this.#previousFocus?.focus({ preventScroll: true });
    };
  };
}

export function createDialogController(options: DialogControllerOptions): DialogController {
  return new DialogController(options);
}
