import React, { useEffect, useMemo, useState } from "react";
// Usa o client oficial do projeto (src/lib/supabaseClient.ts)
import { supabase } from "@/lib/supabaseClient";
import type { Emprestimo } from "@/store/useEmprestimosStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  emprestimo: Emprestimo | null;
};

function brl(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function JurosAtrasoConfigModal({ open, onClose, onSaved, emprestimo }: Props) {
  const [loading, setLoading] = useState(false);

  const clienteNome = String((emprestimo as any)?.clienteNome ?? "Cliente");

  const initial = useMemo(() => {
    const payload = ((emprestimo as any)?.payload ?? {}) as any;
    const cfg = (payload?.juros_atraso_config ?? null) as any;

    // compat: se existir legado em colunas, ainda respeita.
    const aplicar = Boolean(cfg?.aplicar ?? (emprestimo as any)?.aplicarJurosAtraso);
    const tipo = ((cfg?.tipo ?? (emprestimo as any)?.jurosAtrasoTipo) as string | undefined) ?? "valor_por_dia";
    const taxa = Number(cfg?.taxa ?? (emprestimo as any)?.jurosAtrasoTaxa ?? 0);
    return { aplicar, tipo, taxa };
  }, [emprestimo]);

  const [aplicar, setAplicar] = useState<boolean>(false);
  const [tipo, setTipo] = useState<"percentual_por_dia" | "valor_por_dia">("valor_por_dia");
  const [taxa, setTaxa] = useState<number>(0);

  useEffect(() => {
    if (!open) return;
    setAplicar(initial.aplicar);
    setTipo(initial.tipo === "percentual_por_dia" ? "percentual_por_dia" : "valor_por_dia");
    setTaxa(initial.taxa);
  }, [open, initial]);

  if (!open || !emprestimo) return null;

  async function salvar() {
    try {
      setLoading(true);
      const id = (emprestimo as any).id as string;

      // ✅ Sem precisar criar colunas novas na tabela.
      // Guardamos a configuração dentro do JSONB `payload` do empréstimo.
      const payloadAtual = ((emprestimo as any).payload ?? {}) as any;
      const novoPayload = {
        ...payloadAtual,
        juros_atraso_config: {
          aplicar: Boolean(aplicar),
          tipo,
          taxa: Number(taxa || 0),
        },
      };

      const { error } = await supabase.from("emprestimos").update({ payload: novoPayload }).eq("id", id);
      if (error) throw error;
      onSaved?.();
      onClose();
    } catch (e: any) {
      alert(e?.message ?? "Erro ao salvar juros por atraso");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-10 w-[92vw] max-w-[520px] max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1312] shadow-2xl flex flex-col">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">Juros por Atraso</h2>
              <div className="mt-1 text-sm text-white/60 truncate">{clienteNome}</div>
            </div>
            <button onClick={onClose} className="rounded-lg px-3 py-1 text-white/70 hover:bg-white/10">✕</button>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-sm text-white/80">Ativar cálculo automático</div>
            <button
              type="button"
              onClick={() => setAplicar((s) => !s)}
              className={
                "h-8 w-14 rounded-full border transition flex items-center px-1 " +
                (aplicar ? "bg-emerald-500/25 border-emerald-500/30" : "bg-white/10 border-white/10")
              }
              aria-label="toggle"
            >
              <span
                className={
                  "h-6 w-6 rounded-full bg-white transition " +
                  (aplicar ? "translate-x-6" : "translate-x-0")
                }
              />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="text-sm text-white/70">Tipo de cálculo</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("percentual_por_dia")}
              className={
                "rounded-xl px-3 py-2 text-sm border " +
                (tipo === "percentual_por_dia"
                  ? "bg-emerald-500 text-slate-950 border-emerald-500"
                  : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10")
              }
            >
              % por dia
            </button>
            <button
              type="button"
              onClick={() => setTipo("valor_por_dia")}
              className={
                "rounded-xl px-3 py-2 text-sm border " +
                (tipo === "valor_por_dia"
                  ? "bg-emerald-500 text-slate-950 border-emerald-500"
                  : "bg-white/5 text-white/80 border-white/10 hover:bg-white/10")
              }
            >
              R$ por dia
            </button>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm text-white/80">{tipo === "percentual_por_dia" ? "Percentual ao dia (%)" : "Valor fixo ao dia (R$)"}</label>
            <input
              type="number"
              value={taxa || ""}
              onChange={(e) => setTaxa(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              placeholder={tipo === "percentual_por_dia" ? "Ex: 10" : "Ex: 2"}
            />
            <div className="mt-1 text-xs text-white/45">
              {tipo === "percentual_por_dia" ? "Ex.: 10%/dia" : "Ex.: R$ 2,00/dia"}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-semibold text-white/90">Prévia</div>
            <div className="mt-2 text-sm text-white/70">
              {aplicar ? (
                tipo === "percentual_por_dia" ? (
                  <>Se a parcela for de <b className="text-white">R$ 100</b>, o juros será <b className="text-white">{brl(100 * (Number(taxa || 0) / 100))}</b> por dia.</>
                ) : (
                  <>O juros será <b className="text-white">{brl(Number(taxa || 0))}</b> por dia em atraso.</>
                )
              ) : (
                <>Juros automático está <b className="text-white">desativado</b>.</>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={loading}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
