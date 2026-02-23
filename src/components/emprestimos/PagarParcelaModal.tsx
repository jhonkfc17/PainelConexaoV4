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

function diffDays(a: Date, b: Date) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / ms);
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
    const total = Number(emprestimo.numeroParcelas ?? 0);
    const all = Array.from({ length: total }, (_, i) => i);

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

  const jurosAtraso = useMemo(() => {
    if (!emprestimo) return 0;
    const v = emprestimo.vencimentos?.[parcelaIndex];
    if (!v) return 0;

    const hoje = new Date();
    const [y, m, d] = v.split("-").map(Number);
    const venc = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
    const dias = Math.max(0, diffDays(hoje, venc));
    if (!emprestimo.aplicarJurosAtraso || dias === 0) return 0;

    const taxa = Number(emprestimo.jurosAtrasoTaxa || 0);
    if (taxa <= 0) return 0;

    if (emprestimo.jurosAtrasoTipo === "percentual_por_dia") {
      return Math.round((emprestimo.valorParcela * (taxa / 100) * dias + Number.EPSILON) * 100) / 100;
    }
    return Math.round((taxa * dias + Number.EPSILON) * 100) / 100;
  }, [emprestimo, parcelaIndex]);

  const valorSugerido = useMemo(() => {
    if (!emprestimo) return 0;
    return Math.round(((emprestimo.valorParcela || 0) + jurosAtraso + Number.EPSILON) * 100) / 100;
  }, [emprestimo, jurosAtraso]);

  if (!open || !emprestimo) return null;
  const semPendentes = pendentes.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[92vw] max-w-[520px] rounded-2xl border border-white/10 bg-[#0B1312] p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Pagar parcela</h2>
            <p className="mt-1 text-sm text-white/60">{emprestimo.clienteNome}</p>
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
                    label: `Parcela ${i + 1} • Venc.: ${emprestimo.vencimentos?.[i] || "-"}`,
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
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
              <div>Parcela: R$ {(emprestimo.valorParcela || 0).toFixed(2)}</div>
              <div>Juros atraso: R$ {jurosAtraso.toFixed(2)}</div>
            </div>
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Cancelar
          </button>

          <button
            disabled={semPendentes || saving}
            onClick={async () => {
              try {
                if (semPendentes) return;
                if (!dataPagamento) return alert("Selecione a data do pagamento.");
                setSaving(true);

                const v = valorPago > 0 ? valorPago : valorSugerido;

                if (onConfirm) {
                  await onConfirm({ idx: parcelaIndex, valorPago: v, jurosAtraso, dataPagamento });
                } else {
                  await pagarParcela({
                    emprestimoId: emprestimo.id,
                    parcelaNumero: parcelaIndex + 1,
                    valorPago: v,
                    jurosAtraso,
                    dataPagamento,
                  });

                  if (typeof refresh === "function") await refresh();
                }

                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Confirmar pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
