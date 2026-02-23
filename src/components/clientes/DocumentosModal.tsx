// src/components/clientes/ClienteDocumentosModal.tsx
import { useMemo, useState } from "react";
import type { Cliente, DocumentoCliente } from "./clienteTipos";

type Props = {
  open: boolean;
  onClose: () => void;
  cliente?: Cliente | null;
};

export default function ClienteDocumentosModal({ open, onClose, cliente }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const docs = useMemo<DocumentoCliente[]>(() => cliente?.documentos ?? [], [cliente]);
  const selected = useMemo(() => docs.find((d) => d.id === selectedId) ?? docs[0], [docs, selectedId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-5xl max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-emerald-500/15 bg-slate-950/90 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-emerald-500/10 px-6 py-4">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-100">Documentos do Cliente</div>
            <div className="truncate text-sm text-slate-400">
              {cliente?.nomeCompleto ?? "—"} • {docs.length} arquivo(s)
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-300 hover:bg-slate-800/60"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="grid flex-1 overflow-y-auto gap-0 md:grid-cols-[320px_1fr]">
          {/* Lista */}
          <div className="border-b border-emerald-500/10 bg-slate-950/50 p-4 md:border-b-0 md:border-r md:border-emerald-500/10">
            {docs.length === 0 ? (
              <div className="text-sm text-slate-400">Nenhum documento salvo para este cliente.</div>
            ) : (
              <div className="space-y-2">
                {docs.map((d) => {
                  const active = selected?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left ${
                        active
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-emerald-500/10 bg-slate-900/25 hover:bg-slate-900/40"
                      }`}
                    >
                      <div className="truncate text-sm text-slate-100">{d.nomeArquivo}</div>
                      <div className="text-[11px] text-slate-500">
                        {d.mimeType === "application/pdf" ? "PDF" : "Imagem"} •{" "}
                        {d.descricao ? d.descricao : "Sem descrição"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="p-4">
            {!selected ? (
              <div className="text-sm text-slate-400">Selecione um documento.</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{selected.nomeArquivo}</div>
                    <div className="text-[11px] text-slate-500">
                      {selected.mimeType} • {selected.createdAt}
                    </div>
                  </div>

                  <a
                    href={selected.dataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-emerald-500/20 bg-slate-900/30 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/50"
                  >
                    Abrir em nova aba
                  </a>
                </div>

                <div className="rounded-2xl border border-emerald-500/10 bg-slate-900/20 p-2">
                  {selected.mimeType === "application/pdf" ? (
                    <iframe
                      title="PDF"
                      src={selected.dataUrl}
                      className="h-[70vh] w-full rounded-xl"
                    />
                  ) : (
                    <img
                      alt={selected.nomeArquivo}
                      src={selected.dataUrl}
                      className="max-h-[70vh] w-full rounded-xl object-contain"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-emerald-500/10 bg-slate-950/60 px-6 py-3 text-[11px] text-slate-500">
          Obs.: como os arquivos ficam no localStorage em Base64, evite arquivos muito grandes.
        </div>
      </div>
    </div>
  );
}
