import { useEffect, useMemo, useState } from "react";
import { useEmprestimosStore } from "../../store/useEmprestimosStore";
import type { Emprestimo } from "../../store/useEmprestimosStore";
import { SelectPremium } from "../ui/SelectPremium";

type Props = {
  open: boolean;
  emprestimo: Emprestimo | null;
  onClose: () => void;
  /**
   * Opcional: se você passar onConfirm, o modal não chama o store direto.
   * Útil para gerar comprovante na tela principal.
   */
  onConfirm?: (args: { idx: number; valorPago: number; jurosAtraso: number; dataPagamento: string }) => Promise<void> | void;
};

function diffDaysISO(aISO: string, bISO: string) {
  const a = new Date(String(aISO) + "T00:00:00");
  const b = new Date(String(bISO) + "T00:00:00");
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function getJurosConfig(emprestimo: any) {
  const payload = (emprestimo?.payload ?? {}) as any;
  const cfg = payload?.juros_atraso_config ?? null;

  const aplicar = Boolean(
    cfg?.aplicar ??
      payload?.aplicarJurosAtraso ?? // legado
      (emprestimo?.aplicarJurosAtraso ?? false)
  );

  const tipo = String(
    cfg?.tipo ??
      payload?.jurosAtrasoTipo ?? // legado
      (emprestimo?.jurosAtrasoTipo ?? "valor_por_dia")
  );

  const taxa = Number(
    cfg?.taxa ??
      payload?.jurosAtrasoTaxa ?? // legado
      (emprestimo?.jurosAtrasoTaxa ?? 0)
  );

  return { aplicar, tipo, taxa };
}

export default function PagarParcelaModal({ open, emprestimo, onClose, onConfirm }: Props) {
  const pagarParcela = useEmprestimosStore((s) => s.pagarParcela);
  const refresh = useEmprestimosStore((s) => s.fetchEmprestimos);

  const [parcelaIndex, setParcelaIndex] = useState(0);
  const [valorPago, setValorPago] = useState<number>(0);
  const [dataPagamento, setDataPagamento] = useState<string>(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const pendentes = useMemo(() => {
    if (!emprestimo) return [] as number[];
    const total = Number((emprestimo as any).numeroParcelas ?? (emprestimo as any).numero_parcelas ?? 0);
    const all = Array.from({ length: Math.max(0, total) }, (_, i) => i);

    // Compat: se parcelasPagas existir (legado), usa ela. Senão, deriva do parcelasDb.
    const paidIdx = Array.isArray((emprestimo as any).parcelasPagas)
      ? ((emprestimo as any).parcelasPagas as number[])
      : Array.isArray((emprestimo as any).parcelasDb)
      ? ((emprestimo as any).parcelasDb as any[])
          .filter((p) => Boolean(p?.pago))
          .map((p) => Math.max(0, Number(p?.numero ?? 0) - 1))
      : [];

    const paid = new Set<number>(paidIdx);
    return all.filter((i) => !paid.has(i));
  }, [emprestimo]);

  useEffect(() => {
    if (!open || !emprestimo) return;
    const first = pendentes[0] ?? 0;
    setParcelaIndex(first);
    setValorPago(0);
    setDataPagamento(new Date().toISOString().slice(0, 10));
  }, [open, emprestimo, pendentes]);

  const parcelaDb = useMemo(() => {
    const arr = Array.isArray((emprestimo as any)?.parcelasDb) ? ((emprestimo as any).parcelasDb as any[]) : [];
    const numero = parcelaIndex + 1;
    return arr.find((p) => Number(p?.numero ?? 0) === numero) ?? null;
  }, [emprestimo, parcelaIndex]);

  const vencimentoISO = useMemo(() => {
    // Prioriza vencimento do banco (parcelasDb). Senão, usa vencimentos[] legado.
    const v1 = String(parcelaDb?.vencimento ?? "");
    if (v1) return v1;
    const v2 = (emprestimo as any)?.vencimentos?.[parcelaIndex];
    return String(v2 ?? "");
  }, [parcelaDb, emprestimo, parcelaIndex]);

  const valorParcela = useMemo(() => {
    // Prioriza valor do banco (parcelasDb). Senão, usa valorParcela do empréstimo.
    const v = Number(parcelaDb?.valor ?? 0);
    if (v > 0) return v;
    return Number((emprestimo as any)?.valorParcela ?? (emprestimo as any)?.valor_parcela ?? 0);
  }, [parcelaDb, emprestimo]);

  const jurosAtraso = useMemo(() => {
    if (!emprestimo) return 0;
    const venc = String(vencimentoISO ?? "");
    if (!venc) return 0;

    const { aplicar, tipo, taxa } = getJurosConfig(emprestimo);
    if (!aplicar || !taxa) return 0;

    const dias = Math.max(0, diffDaysISO(dataPagamento, venc));
    if (dias <= 0) return 0;

    const porDia = tipo === "percentual_por_dia" ? valorParcela * (taxa / 100) : taxa;
    const total = porDia * dias;
    return Number.isFinite(total) ? Math.round((total + Number.EPSILON) * 100) / 100 : 0;
  }, [emprestimo, vencimentoISO, dataPagamento, valorParcela]);

  const valorSugerido = useMemo(() => {
    return Math.round(((valorParcela || 0) + (jurosAtraso || 0) + Number.EPSILON) * 100) / 100;
  }, [valorParcela, jurosAtraso]);

  if (!open || !emprestimo) return null;
  const semPendentes = pendentes.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[92vw] max-w-[520px] rounded-2xl border border-white/10 bg-[#0B1312] p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Pagar parcela</h2>
            <p className="mt-1 text-sm text-white/60">{(emprestimo as any).clienteNome ?? (emprestimo as any).cliente_nome ?? ""}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-white/70 hover:bg-white/10">
            ✕
          </button>
        </div>

        {semPendentes ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            Este empréstimo não possui parcelas pendentes.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-white/80">Parcela</label>
                <SelectPremium
                  value={String(parcelaIndex)}
                  onChange={(v) => {
                    const idx = Number(v);
                    setParcelaIndex(idx);
                    setValorPago(0);
                  }}
                  className="rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm"
                  options={pendentes.map((i) => ({
                    value: String(i),
                    label: `Parcela ${i + 1} • Venc.: ${
                      (Array.isArray((emprestimo as any)?.parcelasDb)
                        ? ((emprestimo as any).parcelasDb as any[]).find((p: any) => Number(p?.numero ?? 0) === i + 1)?.vencimento
                        : null) ||
                      (emprestimo as any)?.vencimentos?.[i] ||
                      "-"
                    }`,
                  }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/80">Valor pago</label>
                <input
                  type="number"
                  value={valorPago || ""}
                  placeholder={String(valorSugerido)}
                  onChange={(e) => setValorPago(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                />
                <div className="mt-1 text-xs text-white/50">Sugestão: R$ {valorSugerido.toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm text-white/80">Data do pagamento</label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              />
              <div className="mt-1 text-xs text-white/50">Usada para calcular juros por atraso (se configurado).</div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between text-sm text-white/80">
                <span>Vencimento</span>
                <b className="text-white">{vencimentoISO || "-"}</b>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-white/80">
                <span>Juros por atraso</span>
                <b className="text-amber-200">R$ {Number(jurosAtraso || 0).toFixed(2)}</b>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-white/80">
                <span>Total sugerido</span>
                <b className="text-emerald-200">R$ {Number(valorSugerido || 0).toFixed(2)}</b>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white/80 hover:bg-white/10"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    if (saving) return;
                    setSaving(true);

                    const valorFinal = Number(valorPago || 0) > 0 ? Number(valorPago || 0) : Number(valorSugerido || 0);

                    if (onConfirm) {
                      await onConfirm({ idx: parcelaIndex, valorPago: valorFinal, jurosAtraso: Number(jurosAtraso || 0), dataPagamento });
                      setSaving(false);
                      onClose();
                      return;
                    }

                    await pagarParcela({
                      emprestimoId: String((emprestimo as any).id),
                      idx: parcelaIndex,
                      valorPago: valorFinal,
                      jurosAtraso: Number(jurosAtraso || 0),
                      dataPagamento,
                    } as any);

                    await refresh();
                    setSaving(false);
                    onClose();
                  } catch (e: any) {
                    console.error(e);
                    alert(e?.message ?? "Falha ao pagar parcela");
                    setSaving(false);
                  }
                }}
                className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Confirmar pagamento"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
