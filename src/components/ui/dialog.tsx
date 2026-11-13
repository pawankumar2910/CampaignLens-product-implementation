'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconClose } from './icons';

/**
 * Modal built on the native <dialog>: the browser provides the focus trap,
 * Escape to close, inert background and focus return to the trigger.
 */
export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <button type="button" className="btn btn-quiet btn-sm -mr-2" onClick={onClose} aria-label="Close dialog">
          <IconClose />
        </button>
      </div>
      <div className="px-5 py-4 text-[0.92rem]">{children}</div>
      {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
