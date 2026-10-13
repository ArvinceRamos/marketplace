"use client";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  body: string;
  action: string;
  variant?: ButtonVariant;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Asks before an irreversible or important action. Uses the native <dialog>:
 * it traps focus, closes on Esc, and returns focus to the button that opened it.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  action,
  variant = "primary",
  pending = false,
  onConfirm,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Pages stay mounted (hidden) after navigation; never come back to an open dialog.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useLayoutEffect(() => () => onCloseRef.current(), []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-0 text-fg shadow-lg backdrop:bg-ink-950/50"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-title">
          {title}
        </h2>
        <p className="text-small text-fg-muted">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : action}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
