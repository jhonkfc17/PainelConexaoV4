import React, { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Optional: when true, clicking backdrop closes modal (default true) */
  closeOnBackdrop?: boolean;
  /** Optional: max width class for panel */
  panelClassName?: string;
};

/**
 * Modal simples, sem dependências, no mesmo padrão visual do painel.
 * - ESC fecha
 * - clique fora fecha (por padrão)
 */
export default function ModalBase({
  open,
  onClose,
  title,
  children,
  closeOnBackdrop = true,
  panelClassName = "max-w-lg",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && onClose()}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={
          "relative w-full rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl " +
          panelClassName
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-base font-extrabold text-white">{title ?? ""}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            title="Fechar"
          >
            ×
          </button>
        </div>

        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
