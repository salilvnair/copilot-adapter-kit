/* Confirm — the warning before something irreversible.
 *
 * dui's AlertDialogView: its confirm and cancel are top-level props rather than
 * per-item callbacks, so they behave, and it brings dui's own focus handling and
 * danger styling instead of a dialog hand-built here.
 *
 * The Spend Guard's danger zone keeps hold-to-confirm, which suits an action you
 * take while staring at the number it protects; a menu entry is chosen in
 * passing and wants a sentence and a deliberate second click. */

import { AlertDialogView } from '@salilvnair/dui';

export function Confirm({
  open, title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialogView
      open={open}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel="Cancel"
      danger={danger}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
