import { useEffect, useMemo, useState } from "react";
import ModalBase from "../ui/ModalBase";
import { supabase } from "@/lib/supabaseClient";
import { getParcelaLabel } from "@/lib/parcelaLabel";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  emprestimo: any;
};

type MultaEntry = {
  id: string;
  kind: "parcela" | "parcela_extra";
  numero: number;
  descricao: string;
  valor: number;
  vencimento: string;
  tipo: string | null;
  aplicadaEm: string | null;
  pago: boolean;
  valorPagoAcumulado: number;
  referenciaParcelaNumero: number | null;
};

function brl(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso?: string | null) {
  const value = String(iso ?? "").trim();
  if (!value) return "-";
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function normalizeTipo(tipo?: string | null) {
  const value = String(tipo ?? "").trim();
  if (value === "percentual_por_dia") return "% por dia";
  if (value === "valor_por_dia") return "R$ por dia";
  if (value === "fixo_unico") return "Fixo";
  return value || "Manual";
}

function isMultaParcelaExtra(parcela: any) {
  const descricao = String(parcela?.descricao ?? "").toLowerCase();
  return (
    Number(parcela?.valor ?? 0) > 0 &&
    Number(parcela?.multa_valor ?? 0) <= 0 &&
    (descricao.includes("multa ref pcl") || Number(parcela?.referencia_parcela_numero ?? 0) > 0)
  );
}

function calcSaldoRestante(parcela: any, overrides?: { valor?: number; multaValor?: number }) {
  const valor = Number(overrides?.valor ?? parcela?.valor ?? 0);
  const multa = Number(overrides?.multaValor ?? parcela?.multa_valor ?? 0);
  const juros = Number(parcela?.juros_atraso ?? 0);
  const acrescimos = Number(parcela?.acrescimos ?? 0);
  const acumulado = Number(parcela?.valor_pago_acumulado ?? 0);
  const total = valor + multa + juros + acrescimos;
  return Math.max(Number((total - acumulado).toFixed(2)), 0);
}

function buildPayloadAtualizado(payloadAtual: any, parcelas: any[], multaConfigOverride?: any) {
  const ordenadas = [...(parcelas ?? [])].sort((a, b) => Number(a?.numero ?? 0) - Number(b?.numero ?? 0));
  const totalReceber = ordenadas.reduce((acc, parcela) => {
    return (
      acc +
      Number(parcela?.valor ?? 0) +
      Number(parcela?.multa_valor ?? 0) +
      Number(parcela?.juros_atraso ?? 0) +
      Number(parcela?.acrescimos ?? 0)
    );
  }, 0);

  const payloadNovo = {
    ...(payloadAtual ?? {}),
    parcelas: ordenadas.length,
    numeroParcelas: ordenadas.length,
    vencimentos: ordenadas.map((parcela) => String(parcela?.vencimento ?? "")).filter(Boolean),
    totalReceber: Number(totalReceber.toFixed(2)),
    total_receber: Number(totalReceber.toFixed(2)),
  } as Record<string, any>;

  if (multaConfigOverride !== undefined) {
    payloadNovo.multa_config = multaConfigOverride;
  }

  return payloadNovo;
}

export default function MultasAplicadasModal({ open, onClose, onSaved, emprestimo }: Props) {
  const [parcelasState, setParcelasState] = useState<any[]>([]);
  const [payloadState, setPayloadState] = useState<any>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [valorEdit, setValorEdit] = useState<string>("");
  const [vencimentoEdit, setVencimentoEdit] = useState<string>("");
  const [tipoEdit, setTipoEdit] = useState<string>("fixo_unico");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setParcelasState(Array.isArray(emprestimo?.parcelasDb) ? [...emprestimo.parcelasDb] : []);
    setPayloadState((emprestimo?.payload ?? {}) as any);
    setEditingId(null);
    setValorEdit("");
    setVencimentoEdit("");
    setTipoEdit("fixo_unico");
    setError(null);
  }, [emprestimo, open]);

  const entries = useMemo<MultaEntry[]>(() => {
    const parcelas = Array.isArray(parcelasState) ? parcelasState : [];
    return parcelas
      .reduce<MultaEntry[]>((acc, parcela: any) => {
        const multaValor = Math.max(0, Number(parcela?.multa_valor ?? 0));
        const extra = isMultaParcelaExtra(parcela);

        if (multaValor > 0) {
          acc.push({
            id: String(parcela?.id ?? `${parcela?.numero ?? 0}-multa`),
            kind: "parcela",
            numero: Number(parcela?.numero ?? 0),
            descricao: String(parcela?.descricao ?? ""),
            valor: multaValor,
            vencimento: String(parcela?.vencimento ?? ""),
            tipo: String(parcela?.multa_tipo ?? "") || null,
            aplicadaEm: String(parcela?.multa_aplicada_em ?? "") || null,
            pago: Boolean(parcela?.pago),
            valorPagoAcumulado: Number(parcela?.valor_pago_acumulado ?? 0),
            referenciaParcelaNumero: null,
          });
          return acc;
        }

        if (extra) {
          acc.push({
            id: String(parcela?.id ?? `${parcela?.numero ?? 0}-extra`),
            kind: "parcela_extra",
            numero: Number(parcela?.numero ?? 0),
            descricao: String(parcela?.descricao ?? ""),
            valor: Math.max(0, Number(parcela?.valor ?? 0)),
            vencimento: String(parcela?.vencimento ?? ""),
            tipo: "final_emprestimo",
            aplicadaEm: null,
            pago: Boolean(parcela?.pago),
            valorPagoAcumulado: Number(parcela?.valor_pago_acumulado ?? 0),
            referenciaParcelaNumero:
              parcela?.referencia_parcela_numero == null ? null : Number(parcela?.referencia_parcela_numero ?? 0),
          });
          return acc;
        }

        return acc;
      }, [])
      .sort((a, b) => a.numero - b.numero);
  }, [parcelasState]);

  const totalMultas = useMemo(() => entries.reduce((acc, item) => acc + Number(item.valor ?? 0), 0), [entries]);

  function iniciarEdicao(entry: MultaEntry) {
    setEditingId(entry.id);
    setValorEdit(Number(entry.valor ?? 0).toFixed(2));
    setVencimentoEdit(String(entry.vencimento ?? ""));
    setTipoEdit(String(entry.tipo ?? "fixo_unico"));
    setError(null);
  }

  function cancelarEdicao() {
    setEditingId(null);
    setValorEdit("");
    setVencimentoEdit("");
    setTipoEdit("fixo_unico");
    setError(null);
  }

  async function persistirParcelas(parcelaIdAlvo?: string, multaConfigOverride?: any) {
    const { data: refreshed, error: errRefresh } = await supabase
      .from("parcelas")
      .select("*")
      .eq("emprestimo_id", emprestimo.id);
    if (errRefresh) throw errRefresh;

    const parcelasAtualizadas = Array.isArray(refreshed) ? refreshed : [];
    const payloadNovo = buildPayloadAtualizado(payloadState, parcelasAtualizadas, multaConfigOverride);

    const { error: errEmprestimo } = await supabase
      .from("emprestimos")
      .update({ payload: payloadNovo })
      .eq("id", emprestimo.id);
    if (errEmprestimo) throw errEmprestimo;

    setParcelasState(parcelasAtualizadas);
    setPayloadState(payloadNovo);
    setEditingId(parcelaIdAlvo ?? null);
    onSaved?.();
  }

  async function salvarEdicao(entry: MultaEntry) {
    if (!emprestimo?.id) return;

    const valor = Math.max(0, Number(valorEdit || 0));
    if (!Number.isFinite(valor)) {
      setError("Informe um valor valido para a multa.");
      return;
    }

    if (entry.kind === "parcela_extra" && !String(vencimentoEdit ?? "").trim()) {
      setError("Informe o vencimento da parcela de multa.");
      return;
    }

    setSavingId(entry.id);
    setError(null);
    try {
      const parcelaAtual = (parcelasState ?? []).find((parcela: any) => String(parcela?.id ?? "") === entry.id);
      if (!parcelaAtual) throw new Error("Multa nao encontrada para edicao.");

      if (entry.kind === "parcela") {
        const update = {
          multa_valor: Number(valor.toFixed(2)),
          multa_tipo: tipoEdit || "fixo_unico",
          multa_aplicada_em: valor > 0 ? String(parcelaAtual?.multa_aplicada_em ?? "").trim() || new Date().toISOString().slice(0, 10) : null,
          saldo_restante: calcSaldoRestante(parcelaAtual, { multaValor: valor }),
        };

        const { error: errUp } = await supabase.from("parcelas").update(update).eq("id", entry.id);
        if (errUp) throw errUp;

        await persistirParcelas(null);
      } else {
        const update = {
          valor: Number(valor.toFixed(2)),
          vencimento: String(vencimentoEdit),
          saldo_restante: calcSaldoRestante(parcelaAtual, { valor }),
        };

        const { error: errUp } = await supabase.from("parcelas").update(update).eq("id", entry.id);
        if (errUp) throw errUp;

        const cfgAtual = (payloadState?.multa_config ?? null) as any;
        const aplicacaoFinal = cfgAtual?.aplicacao_final as any;
        const nextCfg =
          cfgAtual && Number(aplicacaoFinal?.parcelaNumero ?? 0) === Number(entry.numero)
            ? {
                ...cfgAtual,
                aplicacao_final: {
                  ...aplicacaoFinal,
                  valorTotal: Number(valor.toFixed(2)),
                  vencimento: String(vencimentoEdit),
                  descricao: String(parcelaAtual?.descricao ?? aplicacaoFinal?.descricao ?? ""),
                },
              }
            : cfgAtual;

        await persistirParcelas(null, nextCfg);
      }

      cancelarEdicao();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao salvar a multa.");
    } finally {
      setSavingId(null);
    }
  }

  async function excluir(entry: MultaEntry) {
    if (!emprestimo?.id) return;
    if (!confirm("Deseja realmente excluir esta multa?")) return;

    setSavingId(entry.id);
    setError(null);
    try {
      const parcelaAtual = (parcelasState ?? []).find((parcela: any) => String(parcela?.id ?? "") === entry.id);
      if (!parcelaAtual) throw new Error("Multa nao encontrada para exclusao.");

      if (entry.kind === "parcela") {
        const update = {
          multa_valor: 0,
          multa_tipo: null,
          multa_aplicada_em: null,
          saldo_restante: calcSaldoRestante(parcelaAtual, { multaValor: 0 }),
        };

        const { error: errUp } = await supabase.from("parcelas").update(update).eq("id", entry.id);
        if (errUp) throw errUp;

        await persistirParcelas(null);
      } else {
        const { error: errDel } = await supabase.from("parcelas").delete().eq("id", entry.id);
        if (errDel) throw errDel;

        const cfgAtual = (payloadState?.multa_config ?? null) as any;
        const aplicacaoFinal = cfgAtual?.aplicacao_final as any;
        const nextCfg =
          cfgAtual && Number(aplicacaoFinal?.parcelaNumero ?? 0) === Number(entry.numero)
            ? { ...cfgAtual, aplicacao_final: null }
            : cfgAtual;

        await persistirParcelas(null, nextCfg);
      }

      cancelarEdicao();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao excluir a multa.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <ModalBase open={open} onClose={onClose} title="Multas aplicadas" panelClassName="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white">{emprestimo?.clienteNome ?? "Cliente"}</div>
          <div className="mt-1 text-xs text-white/60">
            {entries.length} multa(s) registrada(s) • Total {brl(totalMultas)}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-white/60">
            Nenhuma multa aplicada neste emprestimo.
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {entries.map((entry) => {
              const bloqueada = entry.pago || entry.valorPagoAcumulado > 0;
              const editing = editingId === entry.id;

              return (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">
                          {entry.kind === "parcela"
                            ? getParcelaLabel({ numero: entry.numero, descricao: entry.descricao })
                            : `Parcela extra ${entry.numero}`}
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${
                            entry.kind === "parcela"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                              : "border-sky-500/30 bg-sky-500/10 text-sky-100"
                          }`}
                        >
                          {entry.kind === "parcela" ? "Na parcela" : "No final do emprestimo"}
                        </span>
                        {bloqueada ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
                            Sem edicao
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 grid gap-1 text-xs text-white/60 sm:grid-cols-2">
                        <div>Valor: <span className="font-semibold text-white">{brl(entry.valor)}</span></div>
                        <div>Vencimento: <span className="font-semibold text-white">{fmtDate(entry.vencimento)}</span></div>
                        <div>Tipo: <span className="font-semibold text-white">{normalizeTipo(entry.tipo)}</span></div>
                        <div>
                          {entry.kind === "parcela"
                            ? <>Aplicada em: <span className="font-semibold text-white">{fmtDate(entry.aplicadaEm)}</span></>
                            : <>Referencia: <span className="font-semibold text-white">{entry.referenciaParcelaNumero ? `Parcela ${entry.referenciaParcelaNumero}` : "Multiplas parcelas"}</span></>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(entry)}
                        disabled={bloqueada || savingId === entry.id}
                        className={
                          "rounded-lg border px-3 py-2 text-xs font-semibold " +
                          (bloqueada
                            ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
                            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
                        }
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void excluir(entry)}
                        disabled={bloqueada || savingId === entry.id}
                        className={
                          "rounded-lg border px-3 py-2 text-xs font-semibold " +
                          (bloqueada
                            ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
                            : "border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15")
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className={`grid gap-3 ${entry.kind === "parcela_extra" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                        <div>
                          <div className="mb-1 text-xs font-semibold text-white/70">Valor da multa</div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={valorEdit}
                            onChange={(e) => setValorEdit(e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                          />
                        </div>

                        {entry.kind === "parcela" ? (
                          <div>
                            <div className="mb-1 text-xs font-semibold text-white/70">Tipo</div>
                            <select
                              value={tipoEdit}
                              onChange={(e) => setTipoEdit(e.target.value)}
                              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                            >
                              <option value="fixo_unico">Fixo</option>
                              <option value="valor_por_dia">R$ por dia</option>
                              <option value="percentual_por_dia">% por dia</option>
                            </select>
                          </div>
                        ) : (
                          <div>
                            <div className="mb-1 text-xs font-semibold text-white/70">Vencimento</div>
                            <input
                              type="date"
                              value={vencimentoEdit}
                              onChange={(e) => setVencimentoEdit(e.target.value)}
                              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                            />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelarEdicao}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void salvarEdicao(entry)}
                          disabled={savingId === entry.id}
                          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                        >
                          {savingId === entry.id ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>
        ) : null}
      </div>
    </ModalBase>
  );
}
