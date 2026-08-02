import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import type { Person } from "./types";
import type { Translator } from "./i18n";

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "medium",
  label,
  closeLabel = "Close",
  inactive = false
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "small" | "medium" | "large";
  label?: string;
  closeLabel?: string;
  inactive?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (inactive || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])"
    )];
    const focusFrame = requestAnimationFrame(() => (focusable()[0] ?? dialog).focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      const openDialogs = document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]'
      );
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      if (dialog.contains(document.activeElement) && previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [inactive]);

  return (
    <div aria-hidden={inactive || undefined} className="modal-backdrop" inert={inactive} onMouseDown={(event) => {
      if (!inactive && event.target === event.currentTarget) onClose();
    }}>
      <section
        aria-label={label ?? title}
        aria-modal={!inactive}
        className={`modal-card modal-${size}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button quiet" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
            <span className="sr-only">{closeLabel}</span>
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function PersonAvatar({ person, size = 44 }: { person: Person; size?: number }) {
  return (
    <span className="person-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {person.photoDataUrl ? (
        <img alt="" src={person.photoDataUrl} />
      ) : (
        <span>{person.displayName.trim().charAt(0).toUpperCase() || "?"}</span>
      )}
    </span>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  t
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  t: Translator;
}) {
  return (
    <Modal title={title} onClose={onClose} closeLabel={t("close")} size="small" footer={
      <>
        <button className="button secondary" onClick={onClose} type="button">{t("cancel")}</button>
        <button className="button danger" onClick={onConfirm} type="button">{confirmLabel}</button>
      </>
    }>
      <p className="dialog-copy">{message}</p>
    </Modal>
  );
}

export function ErrorNotice({ message }: { message?: string }) {
  return message ? <p className="error-notice" role="alert">{message}</p> : null;
}

export function LoadingScreen({ t }: { t: Translator }) {
  return (
    <main className="loading-screen">
      <img alt="" aria-hidden="true" className="brand-mark large" height={192} src="/pwa-192.png" width={192} />
      <strong>Heritg</strong>
      <p>{t("loading")}</p>
    </main>
  );
}
