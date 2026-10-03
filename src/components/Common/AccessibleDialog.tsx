import { useEffect, useId, useRef, type ReactNode } from "react";

export default function AccessibleDialog({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    return () => {
      document.body.style.overflow = previousOverflow;
      if (element.open && typeof element.close === "function") element.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={`app-dialog ${className}`.trim()}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="app-dialog__surface">
        <header className="app-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <button
            className="app-dialog__close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="app-dialog__body">{children}</div>
      </div>
    </dialog>
  );
}
