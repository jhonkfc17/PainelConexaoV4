import { useEffect, useMemo, useState } from "react";
import { useEmprestimosStore } from "@/store/useEmprestimosStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { PagamentoDb, PagamentoTipo } from "@/services/emprestimos.service";
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

function isEstornado(p: PagamentoDb) {
  return Boolean(p.estornado_em);
}

export default function PagamentosSidepanel({ open, onClose, emprestimo }: Props) {
  const role = useAuthStore((s) => s.role);
  const isAdmin = role === "admin";

  const loading = useEmprestimosStore((s) => s.loading);
  const error = useEmprestimosStore((s) => s.error);
  const fetchPagamentos = useEmprestimosStore((s) => s.fetchPagamentos);
  const registrarPagamento = useEmprestimosStore((s) => s.registrarPagamento);
  const estornarPagamento = useEmprestimosStore((s) => s.estornarPagamento);
  // Evita criar um novo array a cada render (isso pode causar loops com React 18 + zustand)
  const pagamentos = useEmprestimosStore((s) => s.pagamentosByEmprestimo[emprestimo?.id] ?? EMPTY_PAGAMENTOS);

  const parcelas = useMemo(() => {
    const p = (emprestimo?.parcelasDb as any[]) ?? [];
    return p
      .map((x, i) => ({
        ...x,
        numero: Number(x.numero ?? i + 1),
        valor: Number(x.valor ?? 0),
        pago: Boolean(x.pago),
        vencimento: String(x.vencimento ?? ""),
        valor_pago_acumulado: Number(x.valor_pago_acumulado ?? 0),
        saldo_restante: Number(x.saldo_restante ?? 0),
      }))
      .sort((a, b) => a.numero - b.numero);
  }, [emprestimo]);

  const parcelasAbertasSemParcial = useMemo(() => {
    return parcelas.filter((p) => !p.pago && (p.saldo_restante ?? 0) <= 0 && (p.valor_pago_acumulado ?? 0) <= 0);
  }, [parcelas]);

  const parcelasAbertas = useMemo(() => parcelas.filter((p) => !p.pago), [parcelas]);

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
    // aproximação: lucro realizado = recebido - principal (limitado ao principal)
    const principal = Number(emprestimo?.valor ?? 0);
    const recebido = totalPagoNaoEstornado;
    return Math.max(recebido - principal, 0);
  }, [emprestimo, totalPagoNaoEstornado]);

  const totalQuitar = useMemo(() => {
    // Soma do que falta: saldo_restante (se houver) senão valor da parcela aberta
    return parcelasAbertas.reduce((acc, p) => {
      const saldo = Number(p.saldo_restante ?? 0);
      if (saldo > 0) return acc + saldo;
      const acumulado = Number(p.valor_pago_acumulado ?? 0);
      if (acumulado > 0) return acc + Math.max(Number(p.valor ?? 0) - acumulado, 0);
      return acc + Number(p.valor ?? 0);
    }, 0);
  }, [parcelasAbertas]);

  // UI state
  const [modo, setModo] = useState<"PARCELA" | "PARCIAL" | "TOTAL">("PARCELA");
  const [dataPagamento, setDataPagamento] = useState<string>(ymdToday());
  const [parcelaNumero, setParcelaNumero] = useState<number>(1);
  const [valorPago, setValorPago] = useState<number>(0);
  const [jurosAtraso, setJurosAtraso] = useState<number>(0);
  const [adiantamento, setAdiantamento] = useState<boolean>(true);

  useEffect(() => {
    if (!open || !emprestimo?.id) return;
    fetchPagamentos(emprestimo.id);
    // defaults
    const primeiraAberta = parcelasAbertas[0]?.numero ?? 1;
    setParcelaNumero(primeiraAberta);
    setDataPagamento(ymdToday());
    setValorPago(0);
    setJurosAtraso(0);
    setAdiantamento(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emprestimo?.id]);

  // Realtime: atualiza painel quando houver mudanças em pagamentos/parcelas
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

  const parcelaSelecionada = useMemo(() => {
    return parcelas.find((p) => Number(p.numero) === Number(parcelaNumero)) ?? null;
  }, [parcelas, parcelaNumero]);

  const sugestaoParcelaIntegral = useMemo(() => {
    if (!parcelaSelecionada) return 0;
    return Math.max(Number(parcelaSelecionada.valor ?? 0) + Number(jurosAtraso ?? 0), 0);
  }, [parcelaSelecionada, jurosAtraso]);

  const saldoAtual = useMemo(() => {
    if (!parcelaSelecionada) return 0;
    const saldo = Number(parcelaSelecionada.saldo_restante ?? 0);
    if (saldo > 0) return saldo;
    const acumulado = Number(parcelaSelecionada.valor_pago_acumulado ?? 0);
    if (acumulado > 0) return Math.max(Number(parcelaSelecionada.valor ?? 0) - acumulado, 0);
    return 0;
  }, [parcelaSelecionada]);

  if (!open || !emprestimo) return null;

  async function onRegistrar(tipo: PagamentoTipo) {
    if (!dataPagamento) return alert("Selecione a data do pagamento.");

    // validações por modo
    if (tipo === "PARCELA_INTEGRAL") {
      if (!parcelaSelecionada) return alert("Selecione a parcela.");
    }
    if (tipo === "ADIANTAMENTO_MANUAL" || tipo === "SALDO_PARCIAL") {
      if (!parcelaSelecionada) return alert("Selecione a parcela.");
      if (!(valorPago > 0)) return alert("Informe o valor pago.");
    }

    if (tipo === "ADIANTAMENTO_MANUAL") {
      const valorParcela = Number(parcelaSelecionada?.valor ?? 0);
      if (valorPago >= valorParcela) {
        return alert("No adiantamento, o valor deve ser MENOR que o valor da parcela.");
      }
    }

    if (tipo === "SALDO_PARCIAL") {
      // pagar saldo restante
      if (saldoAtual <= 0) return alert("Esta parcela não possui saldo pendente.");
      if (valorPago > saldoAtual) return alert("O valor não pode ser maior que o saldo pendente.");
    }

    if (tipo === "QUITACAO_TOTAL") {
      if (totalQuitar <= 0) return alert("Não há valores pendentes para quitar.");
    }

    const valorFinal =
      tipo === "PARCELA_INTEGRAL" ? (valorPago > 0 ? valorPago : sugestaoParcelaIntegral) : tipo === "QUITACAO_TOTAL" ? totalQuitar : valorPago;

    await registrarPagamento({
      emprestimoId: emprestimo.id,
      tipo,
      dataPagamento,
      valor: valorFinal,
      parcelaNumero: tipo === "QUITACAO_TOTAL" ? null : Number(parcelaNumero),
      jurosAtraso: tipo === "PARCELA_INTEGRAL" ? Number(jurosAtraso ?? 0) : 0,
      flags: {
        origem: "ui_sidepanel_pagamentos",
        adiantamento: tipo === "ADIANTAMENTO_MANUAL" ? true : undefined,
      },
    });
  }

  async function onEstornar(p: PagamentoDb) {
    if (!p?.id) return;
    if (p.tipo === "ADIANTAMENTO_MANUAL" && !isAdmin) {
      return alert("ADIANTAMENTO_MANUAL só pode ser revertido por admin.");
    }
    const ok = confirm("Confirmar estorno deste pagamento?\n\nEssa ação NÃO apaga o registro — apenas marca como estornado e reverte o estado.");
    if (!ok) return;

    const motivo = prompt("Motivo do estorno (opcional):") ?? "";
    await estornarPagamento({ emprestimoId: emprestimo.id, pagamentoId: p.id, motivo, isAdmin });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="absolute right-0 top-0 h-full w-full max-w-[520px] border-l border-white/10 bg-[#070B12] p-4 sm:p-6 text-white shadow-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/50">Pagamentos</div>
            <div className="mt-1 text-lg font-semibold truncate">{emprestimo?.clienteNome ?? "Contrato"}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">Lucro previsto: <b className="text-white">{brl(lucroPrevisto)}</b></span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">Lucro realizado: <b className="text-white">{brl(lucroRealizado)}</b></span>
              {houveAdiantamento ? (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">Houve adiantamento</span>
              ) : null}
            </div>
          </div>

          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
            Fechar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => setModo("PARCELA")}
            className={`rounded-xl px-3 py-2 text-sm border ${modo === "PARCELA" ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10"}`}
          >
            Pagar Parcela
          </button>
          <button
            onClick={() => setModo("PARCIAL")}
            className={`rounded-xl px-3 py-2 text-sm border ${modo === "PARCIAL" ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10"}`}
          >
            Parcial
          </button>
          <button
            onClick={() => setModo("TOTAL")}
            className={`rounded-xl px-3 py-2 text-sm border ${modo === "TOTAL" ? "bg-emerald-500 text-slate-950 border-emerald-500" : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10"}`}
          >
            Quitar Total
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/70">Data do pagamento</label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            {modo !== "TOTAL" ? (
              <div>
                <label className="text-xs text-white/70">Parcela (número)</label>
                <select
                  value={String(parcelaNumero)}
                  onChange={(e) => setParcelaNumero(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                >
                  {(modo === "PARCELA" ? parcelasAbertasSemParcial : parcelasAbertas).map((p) => (
                    <option key={p.numero} value={p.numero}>
                      {`Parcela ${p.numero}${p.vencimento ? ` • Venc. ${p.vencimento}` : ""}${p.saldo_restante ? ` • Saldo ${brl(p.saldo_restante)}` : ""}`}
                    </option>
                  ))}
                </select>
                {modo === "PARCELA" && parcelasAbertasSemParcial.length === 0 ? (
                  <div className="mt-1 text-xs text-amber-200/80">Sem parcelas "integrais" em aberto (pode existir parcela parcial).</div>
                ) : null}
              </div>
            ) : null}
          </div>

          {modo === "PARCELA" ? (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/70">Juros atraso (opcional)</label>
                <input
                  type="number"
                  value={jurosAtraso}
                  onChange={(e) => setJurosAtraso(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/70">Valor pago (opcional)</label>
                <input
                  type="number"
                  value={valorPago || ""}
                  onChange={(e) => setValorPago(Number(e.target.value))}
                  placeholder={String(sugestaoParcelaIntegral)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
                <div className="mt-1 text-[11px] text-white/50">Sugestão: {brl(sugestaoParcelaIntegral)}</div>
              </div>
            </div>
          ) : null}

          {modo === "PARCIAL" ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-white/80">
                  <input type="checkbox" checked={adiantamento} onChange={(e) => setAdiantamento(e.target.checked)} />
                  É um adiantamento de pagamento
                </label>
                {saldoAtual > 0 ? (
                  <span className="text-xs text-amber-200/80">Saldo pendente: <b>{brl(saldoAtual)}</b></span>
                ) : null}
              </div>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/70">Valor pago</label>
                  <input
                    type="number"
                    value={valorPago || ""}
                    onChange={(e) => setValorPago(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] text-white/60">Parcela</div>
                  <div className="mt-1 text-sm font-semibold">{brl(Number(parcelaSelecionada?.valor ?? 0))}</div>
                  {saldoAtual > 0 ? (
                    <div className="mt-1 text-xs text-amber-200/80">Ainda deve: {brl(saldoAtual)}</div>
                  ) : (
                    <div className="mt-1 text-xs text-white/50">Sem saldo pendente registrado.</div>
                  )}
                </div>
              </div>

              <div className="mt-2 text-xs text-white/50">
                * Se já houver saldo pendente, este modo funciona como "pagar saldo" (até quitar a parcela).
              </div>
            </div>
          ) : null}

          {modo === "TOTAL" ? (
            <div className="mt-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-white/60">Valor total a quitar</div>
                <div className="mt-1 text-xl font-bold text-emerald-300">{brl(totalQuitar)}</div>
                <div className="mt-2 text-xs text-white/50">Somatório do que falta (parcelas abertas + saldos pendentes).</div>
              </div>
            </div>
          ) : null}

          {error ? <div className="mt-3 text-xs text-red-200/90">{error}</div> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            {modo === "PARCELA" ? (
              <button
                disabled={loading || !parcelaSelecionada}
                onClick={() => onRegistrar("PARCELA_INTEGRAL")}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-95 disabled:opacity-60"
              >
                Registrar pagamento
              </button>
            ) : null}

            {modo === "PARCIAL" ? (
              <button
                disabled={loading || !parcelaSelecionada}
                onClick={() => onRegistrar(adiantamento && saldoAtual <= 0 ? "ADIANTAMENTO_MANUAL" : "SALDO_PARCIAL")}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-95 disabled:opacity-60"
              >
                Registrar pagamento
              </button>
            ) : null}

            {modo === "TOTAL" ? (
              <button
                disabled={loading || totalQuitar <= 0}
                onClick={() => onRegistrar("QUITACAO_TOTAL")}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:opacity-95 disabled:opacity-60"
              >
                Quitar contrato
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Histórico de pagamentos</div>
            <button
              onClick={() => fetchPagamentos(emprestimo.id)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
            >
              Atualizar
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {(pagamentos ?? []).length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">Sem pagamentos registrados.</div>
            ) : (
              (pagamentos ?? []).map((p) => (
                <div key={p.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {p.tipo}
                        {p.parcela_numero ? ` • Parcela ${p.parcela_numero}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        Data: {p.data_pagamento} • Valor: <b className="text-white">{brl(Number(p.valor ?? 0) + Number(p.juros_atraso ?? 0))}</b>
                      </div>
                      {p.estornado_em ? (
                        <div className="mt-1 text-xs text-amber-200/90">Estornado em {p.estornado_em}{p.estornado_motivo ? ` • ${p.estornado_motivo}` : ""}</div>
                      ) : null}
                    </div>

                    {!p.estornado_em ? (
                      <button
                        onClick={() => onEstornar(p)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold border ${p.tipo === "ADIANTAMENTO_MANUAL" && !isAdmin ? "opacity-50 cursor-not-allowed border-white/10 bg-white/5 text-white/60" : "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/15"}`}
                        disabled={p.tipo === "ADIANTAMENTO_MANUAL" && !isAdmin}
                        title={p.tipo === "ADIANTAMENTO_MANUAL" && !isAdmin ? "Somente admin pode estornar" : ""}
                      >
                        Estornar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 text-[11px] text-white/50">
            Observação: o estorno não apaga o registro — mantém auditoria e reverte o estado anterior.
          </div>
        </div>
      </div>
    </div>
  );
}
