import { useEffect, useMemo, useState } from "react";
import type { Cliente } from "./clienteTipos";
import { iniciais } from "./clienteUtils";
import { listEmprestimosByCliente } from "../../services/emprestimos.service";

type Tab = "resumo" | "documentos" | "emprestimos";

type Props = {
  open: boolean;
  onClose: () => void;
  cliente?: Cliente | null;

  onEdit?: (c: Cliente) => void;
  onDocs?: (c: Cliente) => void;
  onNewLoan?: (c: Cliente) => void;
};

export default function ClienteDrawer({ open, onClose, cliente, onEdit, onDocs, onNewLoan }: Props) {
  const [tab, setTab] = useState<Tab>("resumo");
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [loans, setLoans] = useState<any[]>([]);
  const docs = useMemo(() => cliente?.documentos ?? [], [cliente]);

  useEffect(() => {
    if (!open) return;
    setTab("resumo");
  }, [open, cliente?.id]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open || !cliente?.id) return;
      if (tab !== "emprestimos") return;
      try {
        setLoadingLoans(true);
        const data = await listEmprestimosByCliente(cliente.id);
        if (!cancelled) setLoans(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setLoans([]);
      } finally {
        if (!cancelled) setLoadingLoans(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [open, tab, cliente?.id]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] md:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[90vh] rounded-t-3xl border border-emerald-500/15 bg-slate-950/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-emerald-500/10 px-4 py-4">
          {cliente?.fotoDataUrl ? (
            <img
              src={cliente.fotoDataUrl}
              alt={cliente.nomeCompleto}
              className="h-11 w-11 shrink-0 rounded-full border border-emerald-500/25 object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/15 text-xs font-bold text-emerald-200">
              {cliente ? iniciais(cliente.nomeCompleto) : "—"}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-slate-100">{cliente?.nomeCompleto ?? "—"}</div>
            <div className="truncate text-xs text-slate-400">{cliente?.email || "Sem e-mail"}</div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                {cliente?.tipoCliente === "emprestimo" ? "Empréstimo" : cliente?.tipoCliente === "produto" ? "Produto" : "Geral"}
              </span>
              <span
                className={`rounded-full border px-2 py-1 text-[11px] ${
                  cliente?.ativo ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-rose-500/25 bg-rose-500/10 text-rose-200"
                }`}
              >
                {cliente?.ativo ? "Ativo" : "Inativo"}
              </span>
              <span className="rounded-full border border-slate-700/70 bg-slate-900/40 px-2 py-1 text-[11px] text-slate-200">
                📞 {cliente?.telefone || "—"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-emerald-500/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-200"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setTab("resumo")}
            className={`rounded-full border px-3 py-2 text-xs ${
              tab === "resumo" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-500/10 bg-slate-900/30 text-slate-200"
            }`}
          >
            Resumo
          </button>
          <button
            type="button"
            onClick={() => setTab("documentos")}
            className={`rounded-full border px-3 py-2 text-xs ${
              tab === "documentos" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-500/10 bg-slate-900/30 text-slate-200"
            }`}
          >
            Documentos ({docs.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("emprestimos")}
            className={`rounded-full border px-3 py-2 text-xs ${
              tab === "emprestimos" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-emerald-500/10 bg-slate-900/30 text-slate-200"
            }`}
          >
            Empréstimos
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[56vh] overflow-y-auto px-4 pb-4">
          {tab === "resumo" && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-xs text-slate-400">Cadastrado em</div>
                <div className="text-sm text-slate-100">
                  {cliente?.createdAt ? String(cliente.createdAt).slice(0, 10).split("-").reverse().join("/") : "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-xs text-slate-400">Observações</div>
                <div className="text-sm text-slate-100">{(cliente as any)?.observacoes || "—"}</div>
              </div>

              <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-3">
                <div className="text-xs text-slate-400">Ações rápidas</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cliente && onNewLoan?.(cliente)}
                    className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
                  >
                    💸 Novo empréstimo
                  </button>
                  <button
                    type="button"
                    onClick={() => cliente && onDocs?.(cliente)}
                    className="rounded-xl border border-emerald-500/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-200"
                  >
                    📎 Ver documentos
                  </button>
                  <button
                    type="button"
                    onClick={() => cliente && onEdit?.(cliente)}
                    className="rounded-xl border border-emerald-500/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-200"
                  >
                    ✏️ Editar
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "documentos" && (
            <div className="space-y-3">
              {docs.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-4 text-center text-sm text-slate-400">
                  Nenhum documento salvo para este cliente.
                </div>
              ) : (
                docs.map((d: any) => (
                  <div key={d.id} className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-3">
                    <div className="truncate text-sm font-semibold text-slate-100">{d.nomeArquivo}</div>
                    <div className="text-[11px] text-slate-500">{d.mimeType === "application/pdf" ? "PDF" : "Imagem"} • {d.descricao || "Sem descrição"}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <a
                        href={d.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-emerald-500/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-200"
                      >
                        Abrir
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "emprestimos" && (
            <div className="space-y-3">
              {loadingLoans ? (
                <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-4 text-center text-sm text-slate-400">
                  Carregando empréstimos...
                </div>
              ) : loans.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-4 text-center text-sm text-slate-400">
                  Nenhum empréstimo encontrado para este cliente.
                </div>
              ) : (
                loans.map((e) => (
                  <div key={e.id} className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-100 truncate">{e.modalidade || "Empréstimo"}</div>
                      <span className="rounded-full border border-slate-700/70 bg-slate-900/40 px-2 py-1 text-[11px] text-slate-200">
                        {e.status || "—"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 px-2 py-2">
                        <div className="text-[11px] text-slate-500">Valor</div>
                        <div className="font-semibold text-slate-100">{(e.valorTotal ?? e.total ?? "—")}</div>
                      </div>
                      <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 px-2 py-2">
                        <div className="text-[11px] text-slate-500">Criado em</div>
                        <div className="font-semibold text-slate-100">{String(e.createdAt ?? e.created_at ?? "").slice(0, 10).split("-").reverse().join("/")}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-emerald-500/10 bg-slate-950/80 px-4 py-3 pb-safe">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => cliente && onNewLoan?.(cliente)}
              className="flex-1 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200"
            >
              💸 Empréstimo
            </button>
            <button
              type="button"
              onClick={() => cliente && onDocs?.(cliente)}
              className="flex-1 rounded-2xl border border-emerald-500/15 bg-slate-900/40 px-4 py-3 text-sm font-semibold text-slate-200"
            >
              📎 Docs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
