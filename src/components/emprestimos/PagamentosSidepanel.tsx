import { useEffect, useMemo, useState } from "react";
import { useEmprestimosStore } from "@/store/useEmprestimosStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { PagamentoDb } from "@/services/emprestimos.service";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_PAGAMENTOS: PagamentoDb[] = [];

type Props = {
  open: boolean;
  onClose: () => void;
  emprestimo: any;
};

function brl(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ymdToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtShort(iso?: string | null) {
  if (!iso) return "—";
  const raw = String(iso).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function isEstornado(p: PagamentoDb) {
  return Boolean(p.estornado_em);
}

function tipoLabel(tipo?: string | null) {
  const t = String(tipo ?? "").toUpperCase();
  if (t === "PARCELA_INTEGRAL") return "Parcela integral";
  if (t === "ADIANTAMENTO_MANUAL") return "Adiantamento";
  if (t === "SALDO_PARCIAL") return "Saldo parcial";
  if (t === "QUITACAO_TOTAL") return "Quitação total";
  if (t === "DESCONTO") return "Desconto";
  return t || "Pagamento";
}

function safeFileName(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function PagamentosSidepanel({ open, onClose, emprestimo }: Props) {
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === "admin";

  const loading = useEmprestimosStore((s) => s.loading);
  const error = useEmprestimosStore((s) => s.error);
  const fetchPagamentos = useEmprestimosStore((s) => s.fetchPagamentos);
  const estornarPagamento = useEmprestimosStore((s) => s.estornarPagamento);
  const atualizarDataPagamento = useEmprestimosStore((s) => s.atualizarDataPagamento);
  const pagamentos = useEmprestimosStore((s) => s.pagamentosByEmprestimo[emprestimo?.id] ?? EMPTY_PAGAMENTOS);

  const [editandoPagamentoId, setEditandoPagamentoId] = useState<string | null>(null);
  const [novaDataPagamento, setNovaDataPagamento] = useState<string>(ymdToday());

  const parcelasByNumero = useMemo(() => {
    const map = new Map<number, any>();
    const arr = Array.isArray(emprestimo?.parcelasDb) ? emprestimo.parcelasDb : [];
    for (const p of arr) {
      const n = Number((p as any)?.numero ?? 0);
      if (n > 0) map.set(n, p);
    }
    return map;
  }, [emprestimo?.parcelasDb]);

  const houveAdiantamento = useMemo(() => {
    return (pagamentos ?? []).some((p) => p.tipo === "ADIANTAMENTO_MANUAL" && !isEstornado(p));
  }, [pagamentos]);

  const lucroPrevisto = useMemo(() => {
    const totalReceber = Number(emprestimo?.totalReceber ?? 0);
    const valor = Number(emprestimo?.valor ?? 0);
    return Math.max(totalReceber - valor, 0);
  }, [emprestimo]);

  const totalPagoNaoEstornado = useMemo(() => {
    return (pagamentos ?? [])
      .filter((p) => !isEstornado(p))
      .reduce((acc, p) => acc + Number(p.valor ?? 0) + Number(p.juros_atraso ?? 0), 0);
  }, [pagamentos]);

  const lucroRealizado = useMemo(() => {
    const principal = Number(emprestimo?.valor ?? 0);
    return Math.max(totalPagoNaoEstornado - principal, 0);
  }, [emprestimo, totalPagoNaoEstornado]);

  useEffect(() => {
    if (!open || !emprestimo?.id) return;
    setEditandoPagamentoId(null);
    setNovaDataPagamento(ymdToday());
    fetchPagamentos(emprestimo.id);
  }, [open, emprestimo?.id, fetchPagamentos]);

  useEffect(() => {
    if (!open || !emprestimo?.id) return;

    const emprestimoId = emprestimo.id;
    const ch = supabase
      .channel(`rt_pagamentos_${emprestimoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pagamentos", filter: `emprestimo_id=eq.${emprestimoId}` },
        async () => {
          await fetchPagamentos(emprestimoId);
          await useEmprestimosStore.getState().fetchEmprestimos();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parcelas", filter: `emprestimo_id=eq.${emprestimoId}` },
        async () => {
          await fetchPagamentos(emprestimoId);
          await useEmprestimosStore.getState().fetchEmprestimos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, emprestimo?.id, fetchPagamentos]);

  if (!open || !emprestimo) return null;

  async function onEstornar(p: PagamentoDb) {
    if (!p?.id) return;
    if (p.tipo === "ADIANTAMENTO_MANUAL" && !isAdmin) {
      return alert("ADIANTAMENTO_MANUAL só pode ser revertido por admin.");
    }
    const ok = confirm("Confirmar exclusão do pagamento?\n\nA ação é feita por estorno para manter auditoria.");
    if (!ok) return;

    const motivo = prompt("Motivo do estorno (opcional):") ?? "";
    await estornarPagamento({ emprestimoId: emprestimo.id, pagamentoId: p.id, motivo, isAdmin });
  }

  function onIniciarEdicaoData(p: PagamentoDb) {
    setEditandoPagamentoId(p.id);
    setNovaDataPagamento(String(p.data_pagamento ?? ymdToday()).slice(0, 10));
  }

  async function onSalvarEdicaoData(p: PagamentoDb) {
    if (!novaDataPagamento) return alert("Selecione a nova data.");
    await atualizarDataPagamento({
      emprestimoId: emprestimo.id,
      pagamentoId: p.id,
      dataPagamento: novaDataPagamento,
    });
    setEditandoPagamentoId(null);
  }

  function buildComprovanteTexto(p: PagamentoDb) {
    const parcelaNumero = Number(p.parcela_numero ?? 0);
    const parcela = parcelaNumero > 0 ? parcelasByNumero.get(parcelaNumero) : null;
    const valor = Number(p.valor ?? 0);
    const juros = Number(p.juros_atraso ?? 0);
    const total = valor + juros;

    const linhas = [
      "COMPROVANTE DE PAGAMENTO",
      "",
      `Cliente: ${String(emprestimo?.clienteNome ?? "Cliente")}`,
      `Contrato: ${String(emprestimo?.id ?? "")}`,
      `Tipo: ${tipoLabel(p.tipo)}`,
      `Data do pagamento: ${fmtShort(p.data_pagamento)}`,
      parcelaNumero > 0 ? `Parcela: ${parcelaNumero}` : "Parcela: —",
      parcela?.vencimento ? `Vencimento da parcela: ${fmtShort(String(parcela.vencimento))}` : "",
      `Valor base: ${brl(valor)}`,
      juros > 0 ? `Juros atraso: ${brl(juros)}` : "",
      `Total pago: ${brl(total)}`,
      `Registro: ${String(p.id ?? "")}`,
      "",
      `Emitido em: ${fmtShort(new Date().toISOString().slice(0, 10))}`,
    ].filter(Boolean);

    return linhas.join("\n");
  }

  function onVisualizarComprovante(p: PagamentoDb) {
    if (isEstornado(p)) {
      alert("Pagamento estornado não possui comprovante ativo.");
      return;
    }
    const texto = buildComprovanteTexto(p);
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Comprovante ${escapeHtml(String(p.id ?? ""))}</title>
          <style>
            body{font-family:Arial,sans-serif;padding:24px;background:#0b1312;color:#e5e7eb;}
            .card{max-width:760px;margin:0 auto;border:1px solid #1f2937;border-radius:14px;padding:16px;background:#111827;}
            h1{font-size:18px;margin:0 0 12px 0;}
            pre{white-space:pre-wrap;line-height:1.5;font-size:13px;}
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Comprovante de Pagamento</h1>
            <pre>${escapeHtml(texto)}</pre>
          </div>
        </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (!w) return alert("Permita pop-ups para visualizar o comprovante.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function onBaixarComprovante(p: PagamentoDb) {
    if (isEstornado(p)) {
      alert("Pagamento estornado não possui comprovante ativo.");
      return;
    }
    const texto = buildComprovanteTexto(p);
    const cliente = safeFileName(String(emprestimo?.clienteNome ?? "cliente"));
    const data = String(p.data_pagamento ?? ymdToday()).slice(0, 10);
    const fileName = `comprovante_${cliente}_${data}_${String(p.id ?? "").slice(0, 8)}.txt`;

    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />

      <div className="relative z-10 w-full max-w-[760px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1312] text-white shadow-2xl">
        <div className="border-b border-white/10 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-white/50">Pagamentos</div>
              <h3 className="mt-1 truncate text-xl font-semibold">Histórico de pagamentos</h3>
              <div className="mt-1 truncate text-sm text-white/70">{String(emprestimo?.clienteNome ?? "Cliente")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                  Lucro previsto: <b className="text-white">{brl(lucroPrevisto)}</b>
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                  Lucro realizado: <b className="text-white">{brl(lucroRealizado)}</b>
                </span>
                {houveAdiantamento ? (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                    Houve adiantamento
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">Pagamentos registrados</div>
            <button
              type="button"
              onClick={() => fetchPagamentos(emprestimo.id)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Atualizar
            </button>
          </div>

          {error ? <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-xs text-red-200/90">{error}</div> : null}

          <div className="grid gap-2">
            {(pagamentos ?? []).length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
                Sem pagamentos registrados.
              </div>
            ) : (
              (pagamentos ?? []).map((p) => {
                const total = Number(p.valor ?? 0) + Number(p.juros_atraso ?? 0);
                const bloqueiaEstorno = p.tipo === "ADIANTAMENTO_MANUAL" && !isAdmin;
                return (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12px] text-white/55">{fmtShort(p.data_pagamento)}</div>
                        <div className="mt-1 truncate text-lg font-bold text-emerald-300">{brl(total)}</div>
                        <div className="mt-1 text-sm text-white/80">
                          {tipoLabel(p.tipo)}
                          {p.parcela_numero ? ` • Parcela ${p.parcela_numero}` : ""}
                        </div>
                        {p.estornado_em ? (
                          <div className="mt-1 text-xs text-amber-200/90">
                            Estornado em {fmtShort(p.estornado_em)}
                            {p.estornado_motivo ? ` • ${p.estornado_motivo}` : ""}
                          </div>
                        ) : null}
                      </div>

                      {!p.estornado_em ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onVisualizarComprovante(p)}
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
                            title="Visualizar comprovante"
                          >
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => onBaixarComprovante(p)}
                            className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/15"
                            title="Baixar comprovante"
                          >
                            Baixar
                          </button>
                          <button
                            type="button"
                            onClick={() => onIniciarEdicaoData(p)}
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10"
                            title="Editar data"
                          >
                            Editar data
                          </button>
                          <button
                            type="button"
                            onClick={() => onEstornar(p)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                              bloqueiaEstorno
                                ? "cursor-not-allowed border-white/10 bg-white/5 text-white/50"
                                : "border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                            }`}
                            disabled={bloqueiaEstorno}
                            title={bloqueiaEstorno ? "Somente admin pode excluir este pagamento" : "Excluir pagamento (estorno)"}
                          >
                            Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {!p.estornado_em && editandoPagamentoId === p.id ? (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="date"
                          value={novaDataPagamento}
                          onChange={(e) => setNovaDataPagamento(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => onSalvarEdicaoData(p)}
                          disabled={loading}
                          className="rounded-lg border border-emerald-500/25 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoPagamentoId(null)}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 text-[11px] text-white/50">
            A exclusão de pagamento é feita por estorno para manter auditoria completa.
          </div>
        </div>
      </div>
    </div>
  );
}
