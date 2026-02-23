// src/components/clientes/ClientesLista.tsx
import type { Cliente } from "./clienteTipos";
import { iniciais } from "./clienteUtils";

type ScoreInfo = { score: number; faixa: "A" | "B" | "C" | "D" };

type Props = {
  clientes: Cliente[];
  scoreById?: Record<string, ScoreInfo>;
  onEdit?: (c: Cliente) => void;
  onDelete?: (c: Cliente) => void;
  onRowClick?: (c: Cliente) => void;
  onNewLoan?: (c: Cliente) => void;

  // ✅ ver documentos
  onDocs?: (c: Cliente) => void;
};

function ScoreBadge({ scoreById, id }: { scoreById?: Record<string, ScoreInfo>; id: string }) {
  const s = scoreById?.[id];
  const faixa = s?.faixa ?? "—";
  const score = s?.score ?? null;

  const cls =
    faixa === "A"
      ? "border-emerald-500/40 text-emerald-200"
      : faixa === "B"
        ? "border-sky-500/40 text-sky-200"
        : faixa === "C"
          ? "border-amber-500/40 text-amber-200"
          : faixa === "D"
            ? "border-rose-500/40 text-rose-200"
            : "border-slate-700/70 text-slate-200";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border bg-slate-900/40 px-3 py-1 text-xs ${cls}`}>
      <span className="font-semibold">{faixa}</span>
      <span className="opacity-80">{score === null ? "—" : score}</span>
    </span>
  );
}

export default function ClientesLista({ clientes, scoreById, onEdit, onDelete, onRowClick, onDocs, onNewLoan }: Props) {
  return (
    <div className="mt-4 overflow-x-hidden">
      {/* =========================
          MOBILE (cards)
         ========================= */}
      <div className="md:hidden space-y-3">
        {clientes.map((c) => (
          <div
            key={c.id}
            onClick={() => onRowClick?.(c)}
            className="cursor-pointer rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-3 hover:bg-slate-900/20"
          >
            <div className="flex items-start gap-3 min-w-0">
              {c.fotoDataUrl ? (
                <img
                  src={c.fotoDataUrl}
                  alt={c.nomeCompleto}
                  className="h-10 w-10 shrink-0 rounded-full border border-emerald-500/25 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/15 text-xs font-bold text-emerald-200">
                  {iniciais(c.nomeCompleto)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-100">{c.nomeCompleto}</div>
                <div className="truncate text-xs text-slate-400">{c.email || "Sem e-mail"}</div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                    {c.tipoCliente === "emprestimo" ? "Empréstimo" : c.tipoCliente === "produto" ? "Produto" : "Geral"}
                  </span>

                  <span
                    className={`rounded-full border px-2 py-1 text-[11px] ${
                      c.ativo ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-rose-500/25 bg-rose-500/10 text-rose-200"
                    }`}
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </span>

                  <ScoreBadge scoreById={scoreById} id={c.id} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-2 py-1">
                    📞 {c.telefone || "—"}
                  </span>
                  <span className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-2 py-1">
                    📅 {String(c.createdAt).slice(0, 10).split("-").reverse().join("/")}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewLoan?.(c);
                  }}
                  className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 active:scale-[0.99]"
                  title="Novo empréstimo"
                >
                  💸 Empréstimo
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDocs?.(c);
                  }}
                  className="rounded-xl border border-emerald-500/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 active:scale-[0.99]"
                  title="Documentos"
                >
                  📎 Docs
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(c);
                  }}
                  className="rounded-xl border border-emerald-500/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 active:scale-[0.99]"
                  title="Editar"
                >
                  ✏️
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(c);
                  }}
                  className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 active:scale-[0.99]"
                  title="Excluir"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}

        {clientes.length === 0 && (
          <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-4 text-center text-sm text-slate-400">
            Nenhum cliente encontrado.
          </div>
        )}
      </div>

      {/* =========================
          DESKTOP (table/grid)
         ========================= */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-emerald-500/10 bg-slate-950/30">
        <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_1fr_160px] gap-3 border-b border-emerald-500/10 px-5 py-3 text-xs text-slate-400">
          <div>Cliente</div>
          <div>Telefone</div>
          <div>Tipo</div>
          <div>Status</div>
          <div>Score</div>
          <div>Cadastrado em</div>
          <div className="text-right">Ações</div>
        </div>

        <div className="divide-y divide-emerald-500/10">
          {clientes.map((c) => (
            <div
              key={c.id}
              onClick={() => onRowClick?.(c)}
              className="grid cursor-pointer grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr_1fr_160px] gap-3 px-5 py-3 hover:bg-slate-900/20"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/15 text-xs font-bold text-emerald-200">
                  {iniciais(c.nomeCompleto)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-100">{c.nomeCompleto}</div>
                  <div className="truncate text-xs text-slate-400">{c.email || "Sem e-mail"}</div>
                </div>
              </div>

              <div className="self-center text-sm text-slate-200">{c.telefone || "—"}</div>

              <div className="self-center">
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                  {c.tipoCliente === "emprestimo" ? "Empréstimo" : c.tipoCliente === "produto" ? "Produto" : "Geral"}
                </span>
              </div>

              <div className="self-center">
                <span
                  className={`rounded-full border px-2 py-1 text-xs ${
                    c.ativo ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-rose-500/25 bg-rose-500/10 text-rose-200"
                  }`}
                >
                  {c.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>

              <div className="self-center">
                <ScoreBadge scoreById={scoreById} id={c.id} />
              </div>

              <div className="self-center text-sm text-slate-200">
                {String(c.createdAt).slice(0, 10).split("-").reverse().join("/")}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewLoan?.(c);
                  }}
                  className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15"
                  title="Novo empréstimo"
                >
                  💸
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDocs?.(c);
                  }}
                  className="rounded-lg border border-emerald-500/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
                  title="Documentos"
                >
                  📎
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(c);
                  }}
                  className="rounded-lg border border-emerald-500/15 bg-slate-900/40 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900/60"
                  title="Editar"
                >
                  ✏️
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(c);
                  }}
                  className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/15"
                  title="Excluir"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 text-[11px] text-slate-500">Dica: clique na linha para visualizar/editar.</div>
      </div>
    </div>
  );
}
