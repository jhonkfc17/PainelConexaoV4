import React, { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// Resolve parcela UUID mesmo quando o modal trabalha com `numero` (ex.: 44)
async function resolveParcelaUuid(params: {
  supabase: any;
  emprestimoId: string;
  parcelaRef: any;
}): Promise<string | null> {
  const { supabase, emprestimoId, parcelaRef } = params;

  // Se já for UUID (string com '-'), use direto
  const rawId = String(parcelaRef?.id ?? "");
  if (rawId.includes("-") && rawId.length >= 32) return rawId;

  // Senão, tenta resolver pelo número da parcela
  const numero = Number(parcelaRef?.numero ?? parcelaRef?.id ?? 0);
  if (!numero) return null;

  const { data, error } = await supabase
    .from("parcelas")
    .select("id")
    .eq("emprestimo_id", emprestimoId)
    .eq("numero", numero)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}


type Props = {
  open: boolean;
  onClose: () => void;
  // Mantemos como any para não travar no tipo do seu projeto
  // (o objeto vem do EmprestimosLista com campos derivados)
  emprestimo: any | null;
};

function brl(v: any) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function addDaysISO(iso: string, days: number) {
  const d = iso ? new Date(iso + "T00:00:00") : new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function RenegociarDividaModal({ open, onClose, emprestimo }: Props) {
  const [step, setStep] = useState<"menu" | "juros_full" | "juros_partial">("menu");
  const [saving, setSaving] = useState(false);
  const [obs, setObs] = useState("");

  const parcelas = useMemo(() => {
    if (!emprestimo) return [];
    return (emprestimo.parcelasDb || emprestimo.parcelas || emprestimo.parcelas_lista || []) as any[];
  }, [emprestimo]);

  const parcelasAbertas = useMemo(() => parcelas.filter((p) => !p?.pago), [parcelas]);

  const parcelaRef = useMemo(() => {
    // próxima parcela aberta (por vencimento)
    const list = [...parcelasAbertas];
    list.sort((a, b) => String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? "")));
    return list[0] ?? null;
  }, [parcelasAbertas]);

  const clienteNome = String(emprestimo?.clienteNome ?? emprestimo?.cliente_nome ?? emprestimo?.cliente ?? "Cliente");
  const saldoDevedor = Number(emprestimo?.restante ?? emprestimo?.saldo_restante ?? emprestimo?.saldoDevedor ?? 0);

  const jurosPorParcela = useMemo(() => {
    // Usa o lucro previsto atual (pós amortização) se vier no objeto.
    const lucro = Number(emprestimo?.lucroPrevisto ?? emprestimo?.lucro_previsto ?? 0);
    const aplicado = String(emprestimo?.jurosAplicado ?? emprestimo?.juros_aplicado ?? "por_parcela");
    // ⚠️ Não misturar "??" com "||" sem parênteses (bug do parser TS/React).
    const nBase = (emprestimo?.numeroParcelas ?? emprestimo?.numero_parcelas ?? (parcelas.length || 1));
    const n = Math.max(1, Number(nBase));
    if (aplicado === "por_parcela") return lucro / n;
    return lucro;
  }, [emprestimo, parcelas.length]);

  // JUROS FULL
  const [dataPagamento, setDataPagamento] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [novoVenc, setNovoVenc] = useState(() => addDaysISO(new Date().toISOString().slice(0, 10), 30));

  // JUROS PARTIAL
  const [parcelaId, setParcelaId] = useState<string>("");
  const parcelaSelecionada = useMemo(() => {
    return parcelasAbertas.find((p) => String(p?.id) === String(parcelaId)) ?? null;
  }, [parcelasAbertas, parcelaId]);

  const jurosTotalParcela = useMemo(() => {
    // Se existir juros_atraso calculado no banco, prioriza. Senão usa jurosPorParcela.
    const j = Number(parcelaSelecionada?.juros_atraso ?? parcelaSelecionada?.jurosAtraso ?? 0);
    return j > 0 ? j : Number(jurosPorParcela ?? 0);
  }, [parcelaSelecionada, jurosPorParcela]);

  const [valorPagoJuros, setValorPagoJuros] = useState<string>("");

  const jurosPendenteFinal = useMemo(() => {
    const pago = Number(valorPagoJuros || 0);
    return Math.max(jurosTotalParcela - pago, 0);
  }, [jurosTotalParcela, valorPagoJuros]);

  const closeAll = () => {
    setStep("menu");
    setObs("");
    setSaving(false);
    onClose();
  };

  const ensureUserId = async () => {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  };

  const registrarJurosFull = async () => {
    if (!emprestimo) return;
    if (!parcelaRef) {
      alert("Sem parcela em aberto para renegociar.");
      return;
    }
    setSaving(true);
    try {
      const userId = await ensureUserId();
      if (!userId) throw new Error("Usuário não autenticado");

      // 1) registra pagamento (somente juros)
            const parcelaUuid = await resolveParcelaUuid({
        supabase,
        emprestimoId: emprestimo.id,
        parcelaRef,
      });
      if (!parcelaUuid) throw new Error("Não foi possível resolver o UUID da parcela selecionada.");

      const insertRes = await supabase.from("pagamentos").insert({
        user_id: userId,
        emprestimo_id: emprestimo.id,
        parcela_id: parcelaUuid,
        tipo: "JUROS_SOMENTE",
        data_pagamento: dataPagamento,
        valor: Number(jurosPorParcela || 0),
        snapshot: {
          origem: "RenegociarDividaModal",
          modo: "juros_somente",
          observacoes: obs,
          parcela_id: parcelaUuid,
          vencimento_antigo: parcelaRef.vencimento,
          vencimento_novo: novoVenc,
          juros_por_parcela: Number(jurosPorParcela || 0),
          saldo_devedor: saldoDevedor,
        },
      });
      if (insertRes.error) throw insertRes.error;

      // 2) empurra vencimento (mantém principal igual)
      const upd = await supabase
        .from("parcelas")
        .update({ vencimento: novoVenc, updated_at: new Date().toISOString() })
        .eq("emprestimo_id", emprestimo.id)
        .eq("numero", Number(parcelaRef?.numero ?? parcelaRef?.id));
      if (upd.error) throw upd.error;

      closeAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Falha ao registrar juros");
      setSaving(false);
    }
  };

  const registrarJurosParcial = async () => {
    if (!emprestimo) return;
    if (!parcelaSelecionada) {
      alert("Selecione uma parcela.");
      return;
    }
    const pago = Number(valorPagoJuros || 0);
    if (!pago || pago <= 0) {
      alert("Informe o valor pago.");
      return;
    }

    setSaving(true);
    try {
      const userId = await ensureUserId();
      if (!userId) throw new Error("Usuário não autenticado");

      const insertRes = await supabase.from("pagamentos").insert({
        user_id: userId,
        emprestimo_id: emprestimo.id,
        parcela_id: parcelaSelecionada.id,
        tipo: "JUROS_PARCIAL",
        data_pagamento: dataPagamento,
        valor: pago,
        snapshot: {
          origem: "RenegociarDividaModal",
          modo: "juros_parcial",
          observacoes: obs,
          parcela_id: parcelaSelecionada.id,
          juros_total: jurosTotalParcela,
          valor_pago: pago,
          juros_pendente_final: jurosPendenteFinal,
          saldo_devedor: saldoDevedor,
        },
      });
      if (insertRes.error) throw insertRes.error;

      // Não altera saldo e nem vencimento (conforme solicitado)
      closeAll();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Falha ao registrar juros parcial");
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={closeAll} />

      <div className="relative w-[92vw] max-w-[520px] rounded-2xl border border-white/10 bg-[#0b0f0e] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="text-lg font-semibold text-white">Renegociar Dívida</div>
          <button
            onClick={closeAll}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[86vh] overflow-y-auto p-5">
          {/* Header cliente */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-100 font-extrabold">
                {(clienteNome?.[0] ?? "C").toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-white font-semibold">{clienteNome}</div>
                <div className="text-sm text-white/70">Saldo devedor: {brl(saldoDevedor)}</div>
                <div className="text-sm text-white/70">Valor por parcela: {brl(Number(emprestimo?.valorParcela ?? emprestimo?.valor_parcela ?? parcelaRef?.valor ?? 0))}</div>
              </div>
            </div>
          </div>

          {step === "menu" && (
            <div className="mt-5 space-y-3">
              <button
                onClick={() => setStep("juros_full")}
                className="w-full rounded-2xl border-2 border-emerald-500/60 bg-emerald-500/10 p-4 text-left hover:bg-emerald-500/15"
              >
                <div className="text-emerald-200 font-semibold">💲 Cliente pagou só os juros</div>
                <div className="text-sm text-emerald-100/80">Registrar pagamento apenas dos juros da parcela</div>
              </button>

              <button
                onClick={() => setStep("juros_partial")}
                className="w-full rounded-2xl border-2 border-sky-500/60 bg-sky-500/10 p-4 text-left hover:bg-sky-500/15"
              >
                <div className="text-sky-200 font-semibold">💲 Pagamento parcial de juros</div>
                <div className="text-sm text-sky-100/80">Registrar pagamento de parte dos juros de uma parcela</div>
              </button>
            </div>
          )}

          {step === "juros_full" && (
            <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-[#071913] p-4">
              <div className="flex items-center justify-between">
                <div className="text-emerald-200 font-semibold text-base">Cliente pagou só os juros</div>
                <button onClick={() => setStep("menu")} className="text-sm text-white/70 hover:text-white">← Voltar</button>
              </div>

              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                <div>
                  <b>Resumo:</b> Cliente paga <b>{brl(jurosPorParcela)}</b> de juros agora.
                </div>
                <div className="mt-1">No próximo mês, o valor a cobrar será: <b>{brl(saldoDevedor)}</b></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/70">Valor Pago (Juros) (R$) *</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                    value={String(Number(jurosPorParcela || 0).toFixed(2)).replace(".", ",")}
                    readOnly
                  />
                  <div className="mt-1 text-[11px] text-white/50">Valor calculado automaticamente, editável</div>
                </div>

                <div>
                  <label className="text-xs text-white/70">Valor Total que Falta (R$)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                    value={String(saldoDevedor.toFixed(2)).replace(".", ",")}
                    readOnly
                  />
                  <div className="mt-1 text-[11px] text-white/50">Só diminui se pagar mais que o juros</div>
                </div>

                <div>
                  <label className="text-xs text-white/70">Data do Pagamento *</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                  <div className="mt-1 text-[11px] text-white/50">Quando o cliente pagou os juros</div>
                </div>

                <div>
                  <label className="text-xs text-white/70">Nova Data de Vencimento *</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                    value={novoVenc}
                    onChange={(e) => setNovoVenc(e.target.value)}
                  />
                  <div className="mt-1 text-[11px] text-white/50">Próxima data de cobrança</div>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs text-white/70">Observações</label>
                <textarea
                  className="mt-1 w-full min-h-[80px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
                  placeholder="Motivo da renegociação..."
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={closeAll}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  onClick={registrarJurosFull}
                  className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Registrar Pagamento de Juros"}
                </button>
              </div>
            </div>
          )}

          {step === "juros_partial" && (
            <div className="mt-5 rounded-2xl border border-sky-500/40 bg-[#06141b] p-4">
              <div className="flex items-center justify-between">
                <div className="text-sky-200 font-semibold text-base">Pagamento Parcial de Juros</div>
                <button onClick={() => setStep("menu")} className="text-sm text-white/70 hover:text-white">← Voltar</button>
              </div>

              <div className="mt-4">
                <label className="text-xs text-white/70">Parcela referente:</label>
                <select
                  className="mt-1 w-full rounded-xl border border-sky-500/30 bg-black/30 px-3 py-2 text-white"
                  value={parcelaId}
                  onChange={(e) => setParcelaId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {parcelasAbertas.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      Parcela {p.numero} - {String(p.vencimento)} - Juros: {brl(Number(p.juros_atraso ?? 0) || jurosPorParcela)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/70">Valor pago agora (R$) *</label>
                  <input
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-sky-500/30 bg-black/30 px-3 py-2 text-white"
                    placeholder="Ex: 500,00"
                    value={valorPagoJuros}
                    onChange={(e) => setValorPagoJuros(e.target.value.replace(/[^0-9,\.]/g, "").replace(",", "."))}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/70">Data do pagamento *</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-sky-500/30 bg-black/30 px-3 py-2 text-white"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
                <div className="flex items-center justify-between text-sm text-white/80">
                  <span>Juros total da parcela:</span>
                  <b>{brl(jurosTotalParcela)}</b>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-white/80">
                  <span>Valor pago agora:</span>
                  <b>- {brl(Number(valorPagoJuros || 0))}</b>
                </div>
                <div className="mt-3 border-t border-white/10 pt-3 flex items-center justify-between">
                  <span className="text-sky-100 font-semibold">Juros pendente final:</span>
                  <span className="text-amber-300 font-extrabold text-lg">{brl(jurosPendenteFinal)}</span>
                </div>
              </div>

              <div className="mt-3 text-[12px] text-white/60">
                O saldo devedor e datas de vencimento não serão alterados. Apenas será registrado o pagamento parcial dos juros.
              </div>

              <div className="mt-4">
                <label className="text-xs text-white/70">Observações</label>
                <textarea
                  className="mt-1 w-full min-h-[80px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
                  placeholder="Motivo da renegociação..."
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={closeAll}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  onClick={registrarJurosParcial}
                  className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Registrar Pagamento Parcial"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}