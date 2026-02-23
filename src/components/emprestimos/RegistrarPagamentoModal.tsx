import { useEffect, useMemo, useState } from "react";
import { useEmprestimosStore } from "@/store/useEmprestimosStore";
import type { PagamentoTipo } from "@/services/emprestimos.service";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  emprestimo: any | null;
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


function diffDaysISO(aISO: string, bISO: string) {
  const a = new Date(String(aISO) + 'T00:00:00');
  const b = new Date(String(bISO) + 'T00:00:00');
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function getJurosConfig(emprestimo: any) {
  const payload = (emprestimo?.payload ?? {}) as any;
  const aplicar = Boolean(payload.aplicarJurosAtraso ?? emprestimo?.aplicarJurosAtraso ?? false);
  const tipo = String(payload.jurosAtrasoTipo ?? emprestimo?.jurosAtrasoTipo ?? 'valor_por_dia');
  const taxa = Number(payload.jurosAtrasoTaxa ?? emprestimo?.jurosAtrasoTaxa ?? 0);
  return { aplicar, tipo, taxa };
}

function calcJurosAtraso(emprestimo: any, parcela: any, dataPagamentoISO: string) {
  const { aplicar, tipo, taxa } = getJurosConfig(emprestimo);
  if (!aplicar || !taxa) return 0;
  const venc = String(parcela?.vencimento ?? '');
  if (!venc) return 0;
  const dias = Math.max(0, diffDaysISO(dataPagamentoISO, venc));
  if (dias <= 0) return 0;
  const valorParcela = Number(parcela?.valor ?? emprestimo?.valorParcela ?? 0);
  const porDia = tipo === 'percentual_por_dia' ? valorParcela * (taxa / 100) : taxa;
  const total = porDia * dias;
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

function normalizeParcela(row: any, i: number) {
  return {
    id: String(row?.id ?? ""),
    numero: Number(row?.numero ?? i + 1),
    valor: Number(row?.valor ?? 0),
    pago: Boolean(row?.pago),
    vencimento: String(row?.vencimento ?? ""),
    valor_pago_acumulado: Number(row?.valor_pago_acumulado ?? 0),
    saldo_restante: Number(row?.saldo_restante ?? 0),
    juros_atraso: Number(row?.juros_atraso ?? 0),
    acrescimos: Number(row?.acrescimos ?? 0),
    multa_valor: Number(row?.multa_valor ?? 0),
  };
}

function saldoDaParcela(p: ReturnType<typeof normalizeParcela>) {
  const saldo = Number(p.saldo_restante ?? 0);
  if (saldo > 0) return saldo;
  const acumulado = Number(p.valor_pago_acumulado ?? 0);
  if (acumulado > 0) return Math.max(Number(p.valor ?? 0) - acumulado, 0);
  if (!p.pago) return Number(p.valor ?? 0);
  return 0;
}

function totalDaParcela(emprestimo: any, p: ReturnType<typeof normalizeParcela>, dataPagamentoISO: string) {
  const principal = saldoDaParcela(p);
  const multa = Number((p as any).multa_valor ?? 0);
  const acrescimos = Number((p as any).acrescimos ?? 0);

  // juros de atraso calculado na data do pagamento (fonte: config do empréstimo)
  const jurosCalc = calcJurosAtraso(emprestimo, p, dataPagamentoISO);

  return Math.max(principal + multa + acrescimos + jurosCalc, 0);
}

export default function RegistrarPagamentoModal({ open, onClose, onSaved, emprestimo }: Props) {
  const registrarPagamento = useEmprestimosStore((s) => s.registrarPagamento);
  const loading = useEmprestimosStore((s) => s.loading);

  // UI (precisa vir antes de useMemo que usa dataPagamento)
  const [tab, setTab] = useState<"PARCELA" | "PARCIAL" | "TOTAL" | "DESCONTO">("PARCELA");
  const [dataPagamento, setDataPagamento] = useState<string>(ymdToday());
  const [selectedParcelas, setSelectedParcelas] = useState<number[]>([]);
  const [valor, setValor] = useState<number>(0);
  const [novaDataVencimento, setNovaDataVencimento] = useState<string>("");
  const [amortizar, setAmortizar] = useState<boolean>(false);
  const [adiantamento, setAdiantamento] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  const parcelas = useMemo(() => {
    const arr = (emprestimo?.parcelasDb as any[]) ?? [];
    return arr.map(normalizeParcela).sort((a, b) => a.numero - b.numero);
  }, [emprestimo]);

  const parcelasAbertas = useMemo(() => parcelas.filter((p) => !p.pago), [parcelas]);

  const totalQuitar = useMemo(() => {
    return parcelasAbertas.reduce((acc, p) => acc + totalDaParcela(emprestimo, p, dataPagamento), 0);
  }, [parcelasAbertas, emprestimo, dataPagamento]);

  useEffect(() => {
    if (!open) return;
    setTab("PARCELA");
    setDataPagamento(ymdToday());
    const first = parcelasAbertas[0]?.numero ?? 1;
    setSelectedParcelas(first ? [first] : []);
    setValor(0);
    setNovaDataVencimento("");
    setAmortizar(false);
    setAdiantamento(false);
  }, [open, parcelasAbertas]);

  const parcelasSelecionadas = useMemo(() => {
    const set = new Set(selectedParcelas.map(Number));
    return parcelasAbertas.filter((p) => set.has(p.numero));
  }, [parcelasAbertas, selectedParcelas]);

  const parcelaRef = useMemo(() => parcelasSelecionadas[0] ?? null, [parcelasSelecionadas]);

  const saldoSelecionado = useMemo(() => {
    if (parcelasSelecionadas.length === 0) return 0;
    if (tab === "PARCELA") return parcelasSelecionadas.reduce((acc, p) => acc + totalDaParcela(emprestimo, p, dataPagamento), 0);
    // parcial/desconto: referência principal = primeira parcela selecionada
    return totalDaParcela(emprestimo, parcelasSelecionadas[0], dataPagamento);
  }, [parcelasSelecionadas, tab]);

  // ===== Preview de amortização (estimativa visual)
  const amortPreview = useMemo(() => {
    if (!amortizar) return null;
    if (!(valor > 0)) return null;

    const principalOriginal = Number(emprestimo?.valor ?? 0);
    if (principalOriginal <= 0) return null;

    // usamos o "restante" atual (somatório das parcelas em aberto) como base do total
    const totalAtual = Number(totalQuitar ?? 0);
    const jurosAtual = Math.max(totalAtual - principalOriginal, 0);

    const amort = Math.min(valor, principalOriginal);
    const novoPrincipal = Math.max(principalOriginal - amort, 0);

    // regra do print: juros reduz proporcionalmente ao principal restante
    const novoJuros = principalOriginal > 0 ? jurosAtual * (novoPrincipal / principalOriginal) : 0;
    const economiaJuros = Math.max(jurosAtual - novoJuros, 0);
    const novoTotal = novoPrincipal + novoJuros;

    const parcelasRestantes = Math.max(parcelasAbertas.length || emprestimo?.numeroParcelas || 1, 1);
    const novaParcela = parcelasRestantes > 0 ? novoTotal / parcelasRestantes : novoTotal;

    return {
      principalOriginal,
      totalAtual,
      jurosAtual,
      amort,
      novoPrincipal,
      novoJuros,
      economiaJuros,
      novoTotal,
      parcelasRestantes,
      novaParcela,
    };
  }, [amortizar, valor, emprestimo?.valor, emprestimo?.numeroParcelas, parcelasAbertas.length, totalQuitar]);

  if (!open || !emprestimo) return null;

  async function confirmar() {
    if (!dataPagamento) return alert("Selecione a data do pagamento.");

    if (tab !== "TOTAL" && parcelasSelecionadas.length === 0) {
      return alert("Selecione ao menos uma parcela.");
    }

    try {
      setSaving(true);

      if (tab === "PARCELA") {
        for (const p of parcelasSelecionadas) {
          const juros = calcJurosAtraso(emprestimo, p, dataPagamento);
          const v = Math.max(saldoDaParcela(p) + Number((p as any).multa_valor ?? 0) + Number((p as any).acrescimos ?? 0) + juros, 0);
          if (v <= 0) continue;
          await registrarPagamento({
            emprestimoId: emprestimo.id,
            tipo: "PARCELA_INTEGRAL" as PagamentoTipo,
            dataPagamento,
            valor: v,
            parcelaNumero: p.numero,
            jurosAtraso: juros,
            flags: { origem: "ui_registrar_pagamento_modal", modo: "PARCELA" },
          });
        }
      }

      if (tab === "PARCIAL") {
        const p = parcelasSelecionadas[0];
        if (!p) return;
        if (!(valor > 0)) return alert("Informe o valor pago.");
        const saldo = totalDaParcela(emprestimo, p, dataPagamento);
        if (saldo <= 0) return alert("Esta parcela não possui saldo pendente.");
        if (valor > saldo) return alert("O valor não pode ser maior que o saldo pendente.");

        await registrarPagamento({
          emprestimoId: emprestimo.id,
          tipo: (adiantamento ? "ADIANTAMENTO_MANUAL" : "SALDO_PARCIAL") as PagamentoTipo,
          dataPagamento,
          valor,
          parcelaNumero: p.numero,
          jurosAtraso: calcJurosAtraso(emprestimo, p, dataPagamento),
          flags: {
            origem: "ui_registrar_pagamento_modal",
            modo: "PARCIAL",
            amortizar_recalcular_juros: amortizar || undefined,
            adiantamento_pagamento: adiantamento || undefined,
            nova_data_vencimento: adiantamento ? undefined : novaDataVencimento || undefined,

            amort_preview: amortPreview
              ? {
                  principal_original: amortPreview.principalOriginal,
                  juros_atual: amortPreview.jurosAtual,
                  amortizacao: amortPreview.amort,
                  novo_principal: amortPreview.novoPrincipal,
                  novo_juros: amortPreview.novoJuros,
                  economia_juros: amortPreview.economiaJuros,
                  novo_total: amortPreview.novoTotal,
                  parcelas_restantes: amortPreview.parcelasRestantes,
                  nova_parcela: amortPreview.novaParcela,
                }
              : undefined,
          },
        });
      }

      if (tab === "TOTAL") {
        if (totalQuitar <= 0) return alert("Não há valores pendentes para quitar.");
        await registrarPagamento({
          emprestimoId: emprestimo.id,
          tipo: "QUITACAO_TOTAL" as PagamentoTipo,
          dataPagamento,
          valor: totalQuitar,
          parcelaNumero: null,
          jurosAtraso: parcelasAbertas.reduce((acc: number, par: any) => acc + calcJurosAtraso(emprestimo, par, dataPagamento), 0),
          flags: { origem: "ui_registrar_pagamento_modal", modo: "TOTAL" },
        });
      }

      if (tab === "DESCONTO") {
        if (!(valor > 0)) return alert("Informe o valor do desconto.");

        let restante = valor;
        const ordenadas = [...parcelasSelecionadas].sort((a, b) => a.numero - b.numero);
        for (const p of ordenadas) {
          if (restante <= 0) break;
          const saldo = saldoDaParcela(p);
          if (saldo <= 0) continue;
          const aplicar = Math.min(restante, saldo);
          restante -= aplicar;

          await registrarPagamento({
            emprestimoId: emprestimo.id,
            tipo: "DESCONTO" as PagamentoTipo,
            dataPagamento,
            valor: aplicar,
            parcelaNumero: p.numero,
            jurosAtraso: calcJurosAtraso(emprestimo, p, dataPagamento),
            flags: { origem: "ui_registrar_pagamento_modal", modo: "DESCONTO" },
          });
        }
      }

      // ✅ avisa a tela pai para atualizar totais/listas
      try {
        onSaved?.();
      } catch {
        // não bloqueia o fechamento do modal
      }

      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Falha ao registrar pagamento");
    } finally {
      setSaving(false);
    }
  }

  const clienteNome = emprestimo?.clienteNome ?? emprestimo?.cliente_nome ?? "Cliente";
  const parcelasTotal = Number(emprestimo?.numeroParcelas ?? parcelas.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/*
        ✅ Scroll do modal:
        - Mantém o header visível
        - O conteúdo do formulário rola dentro do modal
      */}
      <div className="relative z-10 w-[92vw] max-w-[560px] max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1312] shadow-2xl flex flex-col">
        {/* Header (fixo) */}
        <div className="p-5 sm:p-6 pb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-white">Registrar Pagamento</h2>
            <p className="mt-1 text-sm text-white/60 truncate">{clienteNome}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-white/70 hover:bg-white/10">
            ✕
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 overflow-y-auto">

        {/* resumo */}
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-200 font-semibold">
              {String(clienteNome || "C")
                .trim()
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm text-white/80 truncate">{clienteNome}</div>
              <div className="text-xs text-white/50">
                Restante: <b className="text-white">{brl(totalQuitar)}</b>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-white/60">
            {tab === "PARCELA" ? (
              <>
                Parcelas selecionadas: <b className="text-white">{selectedParcelas.length || 0}</b> • Total: <b className="text-white">{brl(saldoSelecionado)}</b>
              </>
            ) : tab === "TOTAL" ? (
              <>
                Quitação total: <b className="text-white">{brl(totalQuitar)}</b>
              </>
            ) : (
              <>
                Parcela: <b className="text-white">{selectedParcelas[0] ? `${selectedParcelas[0]}/${parcelasTotal}` : "-"}</b> • Saldo: <b className="text-white">{brl(saldoSelecionado)}</b>
              </>
            )}
          </div>
        </div>

        {/* tabs */}
        <div className="mt-4">
          <div className="text-sm text-white/70 mb-2">Tipo de Pagamento</div>
          <div className="grid grid-cols-4 gap-2">
            {([
              ["PARCELA", "Parcela"],
              ["PARCIAL", "Parcial"],
              ["TOTAL", "Total"],
              ["DESCONTO", "% Desconto"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={
                  `rounded-xl px-3 py-2 text-xs sm:text-sm border ` +
                  (tab === k
                    ? "bg-emerald-500 text-slate-950 border-emerald-500"
                    : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* seleção de parcelas */}
        {tab !== "TOTAL" ? (
          <div className="mt-4">
            <div className="text-sm text-white/70">Referente a qual Parcela?</div>
            <div className="mt-2 rounded-2xl border border-white/10 bg-black/15 overflow-hidden">
              <div className="px-4 py-2 text-xs text-white/40 border-b border-white/10">
                Clique para selecionar {tab === "PARCELA" || tab === "DESCONTO" ? "múltiplas parcelas" : "uma parcela"}
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                {parcelasAbertas.length === 0 ? (
                  <div className="p-4 text-sm text-white/60">Nenhuma parcela em aberto.</div>
                ) : (
                  parcelasAbertas.map((p) => {
                    const active = selectedParcelas.includes(p.numero);
                    const allowMulti = tab === "PARCELA" || tab === "DESCONTO";
                    return (
                      <button
                        key={p.id || p.numero}
                        onClick={() => {
                          setSelectedParcelas((cur) => {
                            if (!allowMulti) return [p.numero];
                            const has = cur.includes(p.numero);
                            if (has) return cur.filter((x) => x !== p.numero);
                            return [...cur, p.numero];
                          });
                        }}
                        className={
                          "w-full flex items-center justify-between px-4 py-3 text-left border-b border-white/10 last:border-b-0 " +
                          (active ? "bg-emerald-500/10" : "hover:bg-white/5")
                        }
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-white font-medium">Parcela {p.numero}/{parcelasTotal || "-"}</div>
                          <div className="text-xs text-white/50 truncate">{p.vencimento || "-"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-white">{brl(totalDaParcela(emprestimo, p, dataPagamento))}</div>
                          {active ? <div className="text-[11px] text-emerald-200">Selecionada</div> : <div className="text-[11px] text-white/30">&nbsp;</div>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Parcial / Desconto */}
        {tab === "PARCIAL" || tab === "DESCONTO" ? (
          <div className="mt-4 grid grid-cols-1 gap-3">
            {/* resumo base */}
            {parcelaRef ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-white/80">
                  <span>Valor base:</span>
                  <b className="text-white">{brl(saldoDaParcela(parcelaRef))}</b>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm text-white/80">
                  <span>Total da parcela:</span>
                  <b className="text-white">{brl(totalDaParcela(emprestimo, parcelaRef, dataPagamento))}</b>
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-sm text-white/80">{tab === "DESCONTO" ? "Valor do desconto *" : "Valor Pago *"}</label>
              <input
                type="number"
                value={valor || ""}
                placeholder={tab === "DESCONTO" ? "0" : String(saldoSelecionado)}
                onChange={(e) => setValor(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              />
              <div className="mt-1 text-xs text-white/45">Máx: {brl(saldoSelecionado)} • Digite qualquer valor até {brl(saldoSelecionado)}</div>
            </div>

            {tab === "PARCIAL" ? (
              <>
                {/* Toggle: amortizar */}
                <button
                  type="button"
                  onClick={() => {
                    setAmortizar((v) => {
                      const next = !v;
                      if (next) setAdiantamento(false);
                      return next;
                    });
                  }}
                  className={
                    "w-full rounded-2xl border px-4 py-3 text-left " +
                    (amortizar ? "border-blue-500/40 bg-blue-500/10" : "border-white/10 bg-white/5 hover:bg-white/10")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-blue-200">Amortizar e recalcular juros</div>
                      <div className="mt-1 text-xs text-white/50">Ative para reduzir o principal e recalcular os juros</div>
                    </div>
                    <div className={"h-6 w-11 rounded-full border transition-all " + (amortizar ? "bg-blue-500/60 border-blue-400/50" : "bg-black/30 border-white/15")}>
                      <div className={"h-5 w-5 rounded-full bg-white transition-all mt-[2px] " + (amortizar ? "translate-x-5" : "translate-x-0")}></div>
                    </div>
                  </div>

                  {amortPreview ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-white/40">Situação atual</div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-white/80">
                        <div className="flex items-center justify-between"><span>Empréstimo (estim.):</span><b className="text-white">{brl(amortPreview.totalAtual)}</b></div>
                        <div className="flex items-center justify-between"><span>Saldo devedor:</span><b className="text-white">{brl(amortPreview.principalOriginal)} principal + {brl(amortPreview.jurosAtual)} juros</b></div>
                      </div>

                      <div className="mt-3 text-[11px] uppercase tracking-wide text-emerald-300/80">Após amortização</div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-white/80">
                        <div className="flex items-center justify-between"><span>Amortização:</span><b className="text-orange-200">-{brl(amortPreview.amort)}</b></div>
                        <div className="flex items-center justify-between"><span>Novo principal:</span><b className="text-emerald-200">{brl(amortPreview.novoPrincipal)}</b></div>
                        <div className="flex items-center justify-between"><span>Novos juros (estim.):</span><b className="text-emerald-200">{brl(amortPreview.novoJuros)}</b></div>
                        <div className="flex items-center justify-between"><span>Economia de juros:</span><b className="text-emerald-200">{brl(amortPreview.economiaJuros)}</b></div>
                      </div>

                      <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">Nova parcela (estim.)</div>
                        <div className="mt-1 flex items-center justify-between text-sm text-white/80">
                          <span>{amortPreview.parcelasRestantes}x restantes</span>
                          <b className="text-emerald-200">{brl(amortPreview.novaParcela)}</b>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </button>

                {/* Toggle: adiantamento */}
                <button
                  type="button"
                  onClick={() => {
                    setAdiantamento((v) => {
                      const next = !v;
                      if (next) setAmortizar(false);
                      return next;
                    });
                  }}
                  className={
                    "w-full rounded-2xl border px-4 py-3 text-left " +
                    (adiantamento ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-amber-200">Adiantamento de pagamento</div>
                      <div className="mt-1 text-xs text-white/50">Subtrai do saldo e mantém o mesmo vencimento</div>
                    </div>
                    <div className={"h-6 w-11 rounded-full border transition-all " + (adiantamento ? "bg-amber-500/60 border-amber-400/50" : "bg-black/30 border-white/15")}>
                      <div className={"h-5 w-5 rounded-full bg-white transition-all mt-[2px] " + (adiantamento ? "translate-x-5" : "translate-x-0")}></div>
                    </div>
                  </div>

                  {adiantamento && parcelaRef ? (
                    <div className="mt-3 text-xs text-white/55">
                      Ativado — o restante <b className="text-white">({brl(Math.max(saldoDaParcela(parcelaRef) - (valor || 0), 0))})</b> continuará vencendo em <b className="text-white">{parcelaRef.vencimento || "-"}</b>
                    </div>
                  ) : null}
                </button>

                {/* Nova data de vencimento (somente quando NÃO é adiantamento) */}
                {!adiantamento ? (
                  <div>
                    <label className="mb-1 block text-sm text-white/80">Nova Data de Vencimento</label>
                    <input
                      type="date"
                      value={novaDataVencimento}
                      onChange={(e) => setNovaDataVencimento(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                    />
                    <div className="mt-1 text-xs text-white/45">Opcional. Se preenchida, o sistema tentará prorrogar o vencimento (via RPC).</div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <label className="mb-1 block text-sm text-white/80">Data do Pagamento</label>
          <input
            type="date"
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
          />
          <div className="mt-1 text-xs text-white/45">Quando o cliente efetivamente pagou</div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            disabled={saving || loading}
            onClick={confirmar}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Registrar Pagamento"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}