import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import PagamentosSidepanel from "../components/emprestimos/PagamentosSidepanel";

import { useEmprestimosStore } from "../store/useEmprestimosStore";
import type { Emprestimo } from "@/store/useEmprestimosStore";
import { fillTemplate, getMessageTemplate } from "../lib/messageTemplates";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyDigits(s?: string) {
  return (s ?? "").replace(/\D/g, "");
}

function lsGet(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export default function EmprestimoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { emprestimos, fetchEmprestimos } = useEmprestimosStore();
  const emprestimo = useMemo(() => emprestimos.find((e) => e.id === id) ?? null, [emprestimos, id]);

  const [pagarOpen, setPagarOpen] = useState(false);

  const [sendingWa, setSendingWa] = useState(false);

  useEffect(() => {
    void fetchEmprestimos();
  }, [fetchEmprestimos]);

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

  const recebido = useMemo(() => {
    if ((emprestimo as any)?.recebido != null) return Number((emprestimo as any).recebido ?? 0);

    return parcelas.reduce((acc, p: any) => {
      const pago = Boolean(p?.pago);
      const v = Number(p?.valor ?? 0);
      const vp = Number(p?.valor_pago ?? 0);
      const acum = Number(p?.valor_pago_acumulado ?? 0);
      const juros = Number(p?.juros_atraso ?? 0);

      if (pago) return acc + (vp > 0 ? vp : v) + juros;
      if (acum > 0) return acc + acum;
      return acc;
    }, 0);
  }, [emprestimo, parcelas]);

  const restante = useMemo(() => {
    if (!emprestimo) return 0;
    if ((emprestimo as any)?.restante != null) return Number((emprestimo as any).restante ?? 0);
    return Math.max(Number(emprestimo.totalReceber ?? 0) - recebido, 0);
  }, [emprestimo, recebido]);

  if (!id) {
    return <div className="p-6 text-white/70">Empréstimo não informado.</div>;
  }

  if (!emprestimo) {
    return (
      <div className="p-6 text-white/70">
        Carregando empréstimo...
        <div className="mt-4">
          <button className="rc-btn-outline" onClick={() => navigate("/emprestimos")}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const phone = onlyDigits(emprestimo?.clienteContato);

  async function sendWhatsAppMessage(text: string) {
    if (!phone) {
      alert("Cliente sem telefone cadastrado.");
      return;
    }

    setSendingWa(true);
    try {
      const waPhone = phone.startsWith("55") ? phone : `55${phone}`;
      const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;

      // abre em nova aba/janela; se bloqueado, tenta mesma aba
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.href = url;
      }
    } catch (e: any) {
      alert(String(e?.message || e) || "Falha ao abrir WhatsApp");
    } finally {
      setSendingWa(false);
    }
  }

  const parcelaParaCobrar = (() => {
    const hoje = new Date().toISOString().slice(0, 10);

    const atrasada = parcelas.find((p: any) => !p.pago && String(p.vencimento) < hoje) ?? null;
    if (atrasada) {
      return {
        idx: Number(atrasada.numero ?? 1) - 1,
        vencimento: String(atrasada.vencimento),
        valor: Number(atrasada.valor ?? emprestimo.valorParcela ?? 0),
        diasAtraso: Math.max(
          0,
          Math.floor(
            (new Date(hoje + "T00:00:00").getTime() - new Date(String(atrasada.vencimento) + "T00:00:00").getTime()) /
              (1000 * 60 * 60 * 24)
          )
        ),
        isAtraso: true,
      };
    }

    const proxima = parcelas.find((p: any) => !p.pago) ?? null;
    if (!proxima) return null;

    return {
      idx: Number(proxima.numero ?? 1) - 1,
      vencimento: String(proxima.vencimento),
      valor: Number(proxima.valor ?? emprestimo.valorParcela ?? 0),
      diasAtraso: 0,
      isAtraso: false,
    };
  })();

  const pixPadrao = lsGet("cfg_pix", "");
  const assinaturaPadrao = lsGet("cfg_assinatura", "");

  function calcularJurosAtrasoEstimadoLocal() {
    if (!parcelaParaCobrar?.isAtraso || !parcelaParaCobrar?.diasAtraso) return 0;
    const payload = ((emprestimo as any)?.payload ?? {}) as any;
    const cfg = (payload?.juros_atraso_config ?? null) as any;
    const aplicar = Boolean(cfg?.aplicar ?? (emprestimo as any).aplicarJurosAtraso);
    const tipo = (cfg?.tipo ?? (emprestimo as any).jurosAtrasoTipo ?? "valor_por_dia") as string;
    const taxa = Number(cfg?.taxa ?? (emprestimo as any).jurosAtrasoTaxa ?? 0);
    if (!aplicar || !taxa) return 0;

    const valorParcela = Number(parcelaParaCobrar.valor ?? 0);
    const porDia = tipo === "percentual_por_dia" ? valorParcela * (taxa / 100) : taxa;
    return Math.max(0, porDia * Number(parcelaParaCobrar.diasAtraso));
  }

  const jurosEstimado = calcularJurosAtrasoEstimadoLocal();

  const varsBase: Record<string, string> = {
    CLIENTE: emprestimo.clienteNome,
    VALOR: parcelaParaCobrar ? brl(parcelaParaCobrar.valor) : brl(emprestimo.valorParcela),
    VALOR_EMPRESTADO: brl(emprestimo.valor),
    VALOR_PARCELA: brl(emprestimo.valorParcela),
    PIX: pixPadrao,
    ASSINATURA: assinaturaPadrao,
  };

  const textoNovoContrato = fillTemplate(getMessageTemplate("novo_contrato"), varsBase);

  const textoCobranca = (() => {
    // Regra do produto:
    // - contratos com 1 parcela → usar template "Cobrança (mensal)"
    // - contratos com mais de 1 parcela → usar template "Cobrança (semanal)"
    // (mesma regra aplicada para atraso)
    const maisDeUmaParcela = Number(emprestimo.numeroParcelas ?? 0) > 1;
    const key = parcelaParaCobrar?.isAtraso
      ? maisDeUmaParcela
        ? "atraso_semanal"
        : "atraso_mensal"
      : maisDeUmaParcela
        ? "cobranca_semanal"
        : "cobranca_mensal";

    const tpl = getMessageTemplate(key);
    const vars = {
      ...varsBase,
      DATA: parcelaParaCobrar?.vencimento ?? "",
      DIAS_ATRASO: String(parcelaParaCobrar?.diasAtraso ?? 0),
      PARCELA: parcelaParaCobrar ? String(parcelaParaCobrar.idx + 1) : "",
      PARCELAS: String(emprestimo.numeroParcelas ?? ""),
      JUROS: jurosEstimado > 0 ? brl(jurosEstimado) : "",
    };

    return fillTemplate(tpl, vars);
  })();

  return (
    <div className="p-4 sm:p-6 text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-white/50">
            <Link to="/emprestimos" className="hover:underline">
              Empréstimos
            </Link>{" "}
            / <span className="text-white/70">Detalhe</span>
          </div>
          <div className="mt-1 text-xl font-semibold truncate">{emprestimo.clienteNome}</div>
        </div>

        <button className="rc-btn-outline" onClick={() => navigate("/emprestimos")}>
          Voltar
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <div className="text-xs text-white/50">Restante</div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">{brl(restante)}</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] text-white/60">Emprestado</div>
              <div className="mt-1 text-sm font-semibold text-white">{brl(emprestimo.valor)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] text-white/60 text-right">Total a receber</div>
              <div className="mt-1 text-sm font-semibold text-white text-right">{brl(emprestimo.totalReceber)}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-[11px] text-white/60">🪙 Lucro ajustado</div>
              <div className="mt-1 text-sm font-semibold text-emerald-300">
                {brl(Number((emprestimo as any)?.lucroAjustado ?? 0))}
              </div>
              {(emprestimo as any)?.foiAmortizado ? (
                <div className="mt-0.5 text-[10px] text-white/55">
                  Previsto: {brl(Number((emprestimo as any)?.lucroPrevistoOriginal ?? 0))}
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-right">
              <div className="text-[11px] text-white/60">✅ Recebido</div>
              <div className="mt-1 text-sm font-semibold text-emerald-300 text-right">{brl(recebido)}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-white/60">
            Parcelas: <span className="text-white/90 font-semibold">{emprestimo.numeroParcelas}x</span> • Valor:{" "}
            <span className="text-white/90 font-semibold">{brl(emprestimo.valorParcela)}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              Status: <span className="font-semibold">{emprestimo.status}</span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              Modalidade: <span className="font-semibold">{emprestimo.modalidade}</span>
            </span>
            {(emprestimo as any)?.foiAmortizado ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                Amortizado ♻️
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60"
                disabled={!phone || sendingWa}
                onClick={() => sendWhatsAppMessage(textoNovoContrato)}
              >
                {sendingWa ? "Enviando..." : "Enviar contrato"}
              </button>
              <button
                className="w-full rounded-xl bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-semibold hover:opacity-95 disabled:opacity-60"
                disabled={!phone || sendingWa}
                onClick={() => sendWhatsAppMessage(textoCobranca)}
              >
                {sendingWa ? "Enviando..." : "Cobrar via WhatsApp"}
              </button>
            </div>

            {parcelaParaCobrar?.isAtraso ? (
              <div className="mt-2 text-xs text-amber-200/80">Existe parcela em atraso (venc.: {parcelaParaCobrar.vencimento}).</div>
            ) : null}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Parcelas</div>
              <div className="text-xs text-white/50">Abra o painel “Pagar” para registrar parcela, parcial/adiantamento ou quitação total.</div>
            </div>

            <button
              className="rounded-xl bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-semibold hover:opacity-95"
              onClick={() => setPagarOpen(true)}
            >
              Pagar
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {parcelas.map((p: any, idx: number) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-black/20 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    Parcela {p.numero}/{emprestimo.numeroParcelas} • {brl(p.valor)}
                  </div>
                  <div className="text-xs text-white/50">Vencimento: {p.vencimento}</div>
                  {!p.pago && (p.saldo_restante > 0 || p.valor_pago_acumulado > 0) ? (
                    <div className="mt-1 text-xs text-amber-200/90">Ainda deve: {brl(p.saldo_restante > 0 ? p.saldo_restante : Math.max(p.valor - p.valor_pago_acumulado, 0))}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {p.pago ? (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">Pago</span>
                  ) : (
                    <button
                      className="rounded-lg bg-emerald-500 text-slate-950 px-3 py-2 text-xs font-semibold hover:opacity-95"
                      onClick={() => setPagarOpen(true)}
                    >
                      Pagar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PagamentosSidepanel open={pagarOpen} onClose={() => setPagarOpen(false)} emprestimo={emprestimo as Emprestimo} />
    </div>
  );
}
