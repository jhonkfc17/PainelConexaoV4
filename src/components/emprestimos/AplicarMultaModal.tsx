import React, { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import ModalBase from "../ui/ModalBase";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  emprestimo: any;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysDiffISO(aISO: string, bISO: string) {
  const a = new Date(String(aISO) + "T00:00:00");
  const b = new Date(String(bISO) + "T00:00:00");
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AplicarMultaModal({ open, onClose, onSaved, emprestimo }: Props) {
  const payload = (emprestimo?.payload ?? {}) as any;
  const existingCfg = payload?.multa_config as any;

  const [tipo, setTipo] = useState<string>(existingCfg?.tipo ?? "fixo_unico_parcela");
  const [valor, setValor] = useState<number>(Number(existingCfg?.valor ?? 0));
  const [alvo, setAlvo] = useState<string>(existingCfg?.alvo ?? "todas_atrasadas");
  const [parcelaNumero, setParcelaNumero] = useState<number>(Number(existingCfg?.parcelaNumero ?? 1));
  const [salvando, setSalvando] = useState(false);

  const preview = useMemo(() => {
    const v = Number(valor || 0);
    if (!v) return "Informe um valor para ver a prévia";
    if (tipo === "fixo_unico_parcela") return `Multa fixa de R$ ${v.toFixed(2)} por parcela selecionada.`;
    if (tipo === "percentual_por_dia") return `Multa de ${v}% ao dia sobre o valor da parcela (somente em atraso).`;
    return `Multa de R$ ${v.toFixed(2)} por dia de atraso (somente em atraso).`;
  }, [tipo, valor]);

  async function aplicar() {
    if (!emprestimo?.id) return;

    setSalvando(true);
    try {
      const cfg = {
        tipo,
        valor: Number(valor || 0),
        alvo,
        parcelaNumero: alvo === "parcela" ? Number(parcelaNumero || 0) : null,
      };

      // 1) salva config no payload do empréstimo
      const payloadAtual = (emprestimo?.payload ?? {}) as any;
      const payloadNovo = { ...payloadAtual, multa_config: cfg };

      const { error: errEmp } = await supabase
        .from("emprestimos")
        .update({ payload: payloadNovo })
        .eq("id", emprestimo.id);
      if (errEmp) throw errEmp;

      // 2) aplica multa diretamente nas parcelas atrasadas (para refletir saldo_restante)
      const hoje = todayISO();

      const { data: parcelasDb, error: errParc } = await supabase
        .from("parcelas")
        .select("id, numero, vencimento, valor, pago, valor_pago_acumulado, juros_atraso, acrescimos")
        .eq("emprestimo_id", emprestimo.id);
      if (errParc) throw errParc;

      const abertas = (parcelasDb ?? []).filter((p: any) => !p?.pago);
      const atrasadas = abertas
        .filter((p: any) => String(p?.vencimento ?? "") < hoje)
        .sort((a: any, b: any) => String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? "")));

      const alvoParcelas =
        alvo === "parcela" && Number(parcelaNumero || 0)
          ? atrasadas.filter((p: any) => Number(p?.numero ?? 0) === Number(parcelaNumero || 0))
          : atrasadas;

      const tipoDb = tipo === "fixo_unico_parcela" ? "fixo_unico" : tipo === "percentual_por_dia" ? "percentual_por_dia" : "valor_por_dia";
      const vCfg = Number(valor || 0);

      await Promise.all(
        (alvoParcelas ?? []).map(async (p: any) => {
          const venc = String(p?.vencimento ?? "");
          const dias = Math.max(0, daysDiffISO(hoje, venc));

          const valorParcela = Number(p?.valor ?? 0);
          const juros = Number(p?.juros_atraso ?? 0);
          const acrescimos = Number(p?.acrescimos ?? 0);
          const acumulado = Number(p?.valor_pago_acumulado ?? 0);

          let multaCalc = 0;
          if (!vCfg) multaCalc = 0;
          else if (tipoDb === "fixo_unico") multaCalc = vCfg;
          else if (tipoDb === "percentual_por_dia") multaCalc = valorParcela * (vCfg / 100) * dias;
          else multaCalc = vCfg * dias;

          multaCalc = Math.max(0, Number(multaCalc.toFixed(2)));

          const total = valorParcela + multaCalc + juros + acrescimos;
          const saldoRestante = Math.max(total - acumulado, 0);

          const { error: errUp } = await supabase
            .from("parcelas")
            .update({
              multa_tipo: tipoDb,
              multa_valor: multaCalc,
              multa_aplicada_em: hoje,
              saldo_restante: saldoRestante,
            })
            .eq("emprestimo_id", emprestimo.id)
              .eq("numero", Number(p?.numero ?? 0));
          if (errUp) throw errUp;
        })
      );

      onSaved?.();
      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Erro ao aplicar multa");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase open={open} onClose={onClose} title="Aplicar multa">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white">{emprestimo?.clienteNome ?? "Cliente"}</div>
          <div className="text-xs text-white/60">Configure a multa para parcelas em atraso</div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-white/70">Tipo de multa</div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTipo("fixo_unico_parcela")}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                tipo === "fixo_unico_parcela" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/80"
              }`}
            >
              Fixo único
            </button>
            <button
              type="button"
              onClick={() => setTipo("valor_por_dia")}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                tipo === "valor_por_dia" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/80"
              }`}
            >
              R$ por dia
            </button>
            <button
              type="button"
              onClick={() => setTipo("percentual_por_dia")}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                tipo === "percentual_por_dia" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/80"
              }`}
            >
              % por dia
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-white/70">Valor</div>
          <input
            value={String(valor ?? "")}
            onChange={(e) => setValor(Number(e.target.value || 0))}
            type="number"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            placeholder="0"
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-white/70">Aplicar em</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAlvo("todas_atrasadas")}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                alvo === "todas_atrasadas" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/80"
              }`}
            >
              Todas atrasadas
            </button>
            <button
              type="button"
              onClick={() => setAlvo("parcela")}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                alvo === "parcela" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-white/80"
              }`}
            >
              Parcela específica
            </button>
          </div>

          {alvo === "parcela" ? (
            <div className="mt-2">
              <div className="text-xs text-white/60 mb-1">Número da parcela</div>
              <input
                value={String(parcelaNumero ?? 1)}
                onChange={(e) => setParcelaNumero(Number(e.target.value || 1))}
                type="number"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                min={1}
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
          <div className="text-xs font-semibold text-white/70 mb-1">Prévia</div>
          {preview}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aplicar}
            disabled={salvando}
            className={
              "rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 " +
              (salvando ? "opacity-60 cursor-not-allowed" : "")
            }
          >
            {salvando ? "Salvando..." : "Aplicar"}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}
