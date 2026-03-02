import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Emprestimo } from "@/store/useEmprestimosStore";
import type { PagamentoDb } from "@/services/emprestimos.service";
import RenegociarDividaModal from "./RenegociarDividaModal";
import EditarEmprestimoModal from "./EditarEmprestimoModal";
import JurosAtrasoConfigModal from "./JurosAtrasoConfigModal";
import AplicarMultaModal from "./AplicarMultaModal";
import PagamentosSidepanel from "./PagamentosSidepanel";
import { useEmprestimosStore } from "../../store/useEmprestimosStore";
import { fillTemplate, getMessageTemplate } from "@/lib/messageTemplates";

type Props = {
  viewMode?: "grid" | "list";
  lista: Emprestimo[];
  onRemover: (id: string) => void;
  onMudarStatus: (id: string, status: Emprestimo["status"]) => void;
  onPagar?: (emprestimo: Emprestimo) => void;
  onComprovante?: (emprestimo: Emprestimo) => void;
  pagamentosMapa?: Record<string, PagamentoDb[]>;
};

function brl(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function initials(name: string) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase() || "CL";
}

function lsGet(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

type DueStatus = "atrasado" | "hoje" | "amanha" | "ok";

function getDueStatus(parcelas: any[]): DueStatus {
  const abertas = (parcelas ?? []).filter((p) => !p?.pago);
  if (abertas.length === 0) return "ok";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  // IMPORTANTÍSSIMO:
  // As parcelas podem vir fora de ordem. E mesmo em ordem, precisamos respeitar prioridade:
  // atrasado > hoje > amanhã.
  // Se retornarmos no primeiro match, podemos marcar como "hoje" mesmo tendo outra parcela atrasada.

  const sorted = [...abertas].sort((a, b) =>
    String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? ""))
  );

  let hasHoje = false;
  let hasAmanha = false;

  for (const p of sorted) {
    const v = String(p?.vencimento ?? "");
    if (!v) continue;

    const venc = new Date(v + "T00:00:00");
    venc.setHours(0, 0, 0, 0);
    if (Number.isNaN(venc.getTime())) continue;

    if (venc < hoje) return "atrasado";
    if (venc.getTime() === hoje.getTime()) hasHoje = true;
    if (venc.getTime() === amanha.getTime()) hasAmanha = true;
  }

  if (hasHoje) return "hoje";
  if (hasAmanha) return "amanha";
  return "ok";
}

function getDueStatusEmprestimo(e: Emprestimo): DueStatus {
  // Fonte de verdade: campos calculados do backend (view v_emprestimos_status)
  const emAtraso = Boolean((e as any).emAtraso ?? (e as any).em_atraso ?? false);
  if (emAtraso) return "atrasado";

  const prox = String((e as any).proximoVencimentoEmAberto ?? (e as any).proximo_vencimento_em_aberto ?? "").trim();

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  if (prox) {
    const venc = new Date(prox + "T00:00:00");
    venc.setHours(0, 0, 0, 0);
    if (!Number.isNaN(venc.getTime())) {
      if (venc.getTime() === hoje.getTime()) return "hoje";
      if (venc.getTime() === amanha.getTime()) return "amanha";
    }
  }

  // Fallback: calcula pelas parcelas locais (quando a view não está disponível)
  const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
  return getDueStatus(parcelas);
}


function prio(d: DueStatus) {
  return d === "atrasado" ? 0 : d === "hoje" ? 1 : d === "amanha" ? 2 : 3;
}

function dueCardTone(d: DueStatus) {
  if (d === "atrasado") return "from-red-600/18 via-red-600/12 to-red-500/10 border-red-500/45";
  if (d === "hoje") return "from-amber-500/20 via-amber-500/12 to-amber-400/10 border-amber-400/45";
  if (d === "amanha") return "from-sky-500/18 via-sky-500/12 to-sky-400/10 border-sky-400/40";
  return "from-emerald-500/18 via-emerald-500/10 to-emerald-400/10 border-emerald-400/35";
}

function glowClass(d: DueStatus) {
  if (d === "amanha") return "shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_14px_40px_rgba(2,132,199,0.14)]";
  if (d === "atrasado") return "shadow-[0_0_0_1px_rgba(239,68,68,0.30),0_14px_40px_rgba(239,68,68,0.12)]";
  if (d === "hoje") return "shadow-[0_0_0_1px_rgba(245,158,11,0.30),0_14px_40px_rgba(245,158,11,0.10)]";
  return "shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_14px_40px_rgba(16,185,129,0.08)]";
}

function pulseClass(d: DueStatus) {
  if (d === "atrasado") return "pulse-due-red";
  if (d === "hoje") return "pulse-due-amber";
  if (d === "amanha") return "pulse-due-sky";
  return "";
}

function chipTone(tone: "danger" | "warn" | "info" | "ok" | "muted") {
  if (tone === "danger") return "border-red-500/30 bg-red-500/15 text-red-100";
  if (tone === "warn") return "border-amber-500/30 bg-amber-500/15 text-amber-100";
  if (tone === "info") return "border-sky-500/30 bg-sky-500/15 text-sky-100";
  if (tone === "ok") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";
  return "border-white/10 bg-white/5 text-white/70";
}

function dueBadge(d: DueStatus) {
  if (d === "atrasado") return { text: "Atrasado", tone: "danger" as const, icon: "⚠️" };
  if (d === "hoje") return { text: "Vence hoje", tone: "warn" as const, icon: "⏰" };
  if (d === "amanha") return { text: "Amanhã", tone: "info" as const, icon: "✨" };
  return { text: "Em dia", tone: "ok" as const, icon: "✅" };
}

function sumParcelasValor(parcelas: any[]): number {
  return (parcelas ?? []).reduce((acc: number, p: any) => {
    const valor = Number(p?.valor ?? 0);
    const multa = Number(p?.multa_valor ?? 0);
    const juros = Number(p?.juros_atraso ?? 0);
    const acrescimos = Number(p?.acrescimos ?? 0);

    return acc + valor + multa + juros + acrescimos;
  }, 0);
}

// Parciais/adiantamentos:
// - pago=true: considera valor_pago (ou valor)
// - pago=false: considera valor_pago_acumulado (se existir)
function sumRecebido(parcelas: any[]): number {
  return (parcelas ?? []).reduce((acc: number, p: any) => {
    const pago = p?.pago === true;
    const valor = Number(p?.valor ?? 0);
    const valorPago = Number(p?.valor_pago ?? 0);
    const acumulado = Number(p?.valor_pago_acumulado ?? 0);
    const juros = Number(p?.juros_atraso ?? 0);

    if (pago) return acc + (valorPago > 0 ? valorPago : valor) + juros;
    if (acumulado > 0) return acc + acumulado;
    return acc;
  }, 0);
}

function sumPagamentos(pags: PagamentoDb[] | undefined): number {
  return (pags ?? [])
    .filter((p) => !(p as any)?.estornado_em)
    .reduce((acc, p) => acc + Number((p as any).valor ?? 0) + Number((p as any).juros_atraso ?? 0), 0);
}

function saldoPendenteParcela(p: any) {
  if (p?.pago === true) return 0;

  const valor = Number(p?.valor ?? 0);
  const multa = Number(p?.multa_valor ?? p?.multaValor ?? 0);
  const juros = Number(p?.juros_atraso ?? p?.jurosAtraso ?? 0);
  const acrescimos = Number(p?.acrescimos ?? p?.acrescimos_valor ?? 0);

  const totalDevido = Math.max(0, valor + multa + juros + acrescimos);

  const acumulado = Number(p?.valor_pago_acumulado ?? 0);
  const pendenteCalculado = Math.max(0, totalDevido - Math.max(0, acumulado));

  const saldoRestante = p?.saldo_restante;
  const saldoRestanteNum =
    saldoRestante === null || saldoRestante === undefined
      ? null
      : Number(saldoRestante);

  /**
   * Regra:
   * - Prioriza cálculo pelo detalhamento da parcela (valor/multa/juros/acréscimos),
   *   para refletir imediatamente multa manual aplicada e evitar saldo inflado.
   * - Usa saldo_restante apenas como fallback quando não há base calculada.
   */

  if (acumulado > 0) {
    return pendenteCalculado;
  }

  if (pendenteCalculado > 0) {
    return pendenteCalculado;
  }

  if (saldoRestanteNum !== null && Number.isFinite(saldoRestanteNum)) {
    return Math.max(0, saldoRestanteNum);
  }

  return pendenteCalculado;
}

function sumRestante(parcelas: any[]): number {
  return (parcelas ?? [])
    .filter((p: any) => !p?.pago)
    .reduce((acc: number, p: any) => acc + saldoPendenteParcela(p), 0);
}

function saldoPendenteParcelaSemMulta(p: any) {
  if (p?.pago === true) return 0;

  const valor = Number(p?.valor ?? 0);
  const juros = Number(p?.juros_atraso ?? p?.jurosAtraso ?? 0);
  const acrescimos = Number(p?.acrescimos ?? p?.acrescimos_valor ?? 0);
  const acumulado = Number(p?.valor_pago_acumulado ?? 0);

  return Math.max(0, valor + juros + acrescimos - Math.max(0, acumulado));
}

function sumRestanteSemMulta(parcelas: any[]): number {
  return (parcelas ?? [])
    .filter((p: any) => !p?.pago)
    .reduce((acc: number, p: any) => acc + saldoPendenteParcelaSemMulta(p), 0);
}

function fmtShort(iso?: string) {
  if (!iso) return "—";
  const d = new Date(String(iso) + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function proximoVencimentoEmprestimo(e: Emprestimo) {
  const prox = (e as any).proximoVencimentoEmAberto ?? (e as any).proximo_vencimento_em_aberto;
  if (prox) return String(prox);
  const parcelas = Array.isArray((e as any).parcelasDb) ? (e as any).parcelasDb : [];
  const abertas = parcelas.filter((p: any) => !p?.pago);
  const sorted = [...abertas].sort((a, b) => String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? "")));
  return sorted[0]?.vencimento ? String(sorted[0].vencimento) : undefined;
}

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

function calcularJurosAtrasoEstimado(e: Emprestimo) {
  const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
  const abertas = parcelas.filter((p) => !p?.pago);
  if (abertas.length === 0) return { total: 0, detalhe: null as null | any };

  const hoje = todayISO();
  const atrasadas = abertas
    .filter((p) => String(p?.vencimento ?? "") < hoje)
    .sort((a, b) => String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? "")));
  if (atrasadas.length === 0) return { total: 0, detalhe: null as null | any };

  const p = atrasadas[0];
  const venc = String(p?.vencimento ?? "");
  const dias = Math.max(0, daysDiffISO(hoje, venc));

  const payload = ((e as any).payload ?? {}) as any;
  const cfg = (payload?.juros_atraso_config ?? null) as any;

  const aplicar = Boolean(cfg?.aplicar ?? (e as any).aplicarJurosAtraso);
  const tipo = ((cfg?.tipo ?? (e as any).jurosAtrasoTipo) as string | undefined) ?? "valor_por_dia";
  const taxa = Number(cfg?.taxa ?? (e as any).jurosAtrasoTaxa ?? 0);
  if (!aplicar || !taxa || dias <= 0) return { total: 0, detalhe: null as null | any };

  const valorParcela = Number(p?.valor ?? (e as any).valorParcela ?? 0);
  const porDia = tipo === "percentual_por_dia" ? valorParcela * (taxa / 100) : taxa;
  const total = Math.max(0, porDia * dias);

  return {
    total,
    detalhe: {
      parcelaNumero: Number(p?.numero ?? 1),
      totalParcelas: Number((e as any).numeroParcelas ?? 1),
      vencimento: venc,
      valorParcela,
      dias,
      tipo,
      taxa,
      porDia,
    },
  };
}

function calcularMultaEstimado(e: Emprestimo) {
  const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
  const abertas = parcelas.filter((p) => !p?.pago);
  if (abertas.length === 0) return { total: 0, detalhe: null as null | any };

  const payload = ((e as any).payload ?? {}) as any;
  const cfg = payload?.multa_config as any;
  if (!cfg?.tipo || !cfg?.valor) return { total: 0, detalhe: null as null | any };

  const tipo = String(cfg.tipo);
  const valor = Number(cfg.valor || 0);
  if (!valor) return { total: 0, detalhe: null as null | any };

  const hoje = todayISO();
  const atrasadas = abertas
    .filter((p) => String(p?.vencimento ?? "") < hoje)
    .sort((a, b) => String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? "")));
  if (atrasadas.length === 0) return { total: 0, detalhe: null as null | any };

  const alvo = String(cfg.alvo ?? "todas_atrasadas");
  const parcelaNumero = Number(cfg.parcelaNumero ?? 0);
  const alvoParcelas = alvo === "parcela" && parcelaNumero ? atrasadas.filter((p) => Number(p?.numero ?? 0) === parcelaNumero) : atrasadas;

  const linhas = alvoParcelas.map((p) => {
    const venc = String(p?.vencimento ?? "");
    const dias = Math.max(0, daysDiffISO(hoje, venc));
    const valorParcela = Number(p?.valor ?? 0);
    let multa = 0;

    if (tipo === "fixo_unico_parcela") {
      multa = valor;
    } else if (tipo === "percentual_por_dia") {
      multa = valorParcela * (valor / 100) * dias;
    } else {
      // valor_por_dia
      multa = valor * dias;
    }

    return { numero: Number(p?.numero ?? 0), vencimento: venc, dias, valorParcela, multa: Math.max(0, multa) };
  });

  const total = linhas.reduce((acc, x) => acc + Number(x.multa || 0), 0);
  const first = linhas[0];

  return {
    total: Math.max(0, total),
    detalhe: first
      ? {
          parcelaNumero: first.numero,
          vencimento: first.vencimento,
          dias: first.dias,
          tipo,
          valor,
        }
      : null,
  };
}

function proximaParcelaAberta(e: Emprestimo) {
  const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];

  // 1) Fonte principal: parcelas do banco
  const abertas = parcelas.filter((p) => !p?.pago);
  if (abertas.length > 0) {
    return abertas
      .slice()
      .sort((a, b) => String(a?.vencimento ?? "").localeCompare(String(b?.vencimento ?? "")))[0];
  }

  // 2) Fallback: monta "parcela virtual" a partir do payload (quando RLS/relacionamento não devolveu parcelas)
  const payload = ((e as any).payload ?? {}) as any;
  const total = Number((e as any).numeroParcelas ?? payload.parcelas ?? payload.numeroParcelas ?? 0);

  const vencs: string[] =
    Array.isArray(payload.vencimentos) && payload.vencimentos.length > 0
      ? payload.vencimentos
      : Array.isArray((e as any).vencimentos) && (e as any).vencimentos.length > 0
        ? (e as any).vencimentos
        : payload.primeiraParcela
          ? [String(payload.primeiraParcela)]
          : (e as any).primeiraParcela
            ? [String((e as any).primeiraParcela)]
            : [];

  const valor = Number((e as any).valorParcela ?? payload.valorParcela ?? payload.valor_parcela ?? 0);

  if (vencs.length === 0 || !valor) return null;

  // pega o próximo vencimento >= hoje; se não existir, pega o último
  const hoje = todayISO();
  const sorted = vencs.slice().sort((a, b) => String(a).localeCompare(String(b)));
  let idx = sorted.findIndex((v) => String(v) >= hoje);
  if (idx < 0) idx = sorted.length - 1;

  return {
    id: "virtual",
    numero: Math.min(Math.max(1, idx + 1), total || idx + 1),
    vencimento: String(sorted[idx]),
    valor,
    pago: false,
  };
}

function badgeToneByDue(d: DueStatus) {
  if (d === "atrasado") return "border-red-500/30 bg-red-500/15 text-red-100";
  if (d === "hoje") return "border-amber-500/30 bg-amber-500/15 text-amber-100";
  if (d === "amanha") return "border-sky-500/30 bg-sky-500/15 text-sky-100";
  return "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";
}

function labelByDue(d: DueStatus) {
  if (d === "atrasado") return "Atrasado";
  if (d === "hoje") return "Vence hoje";
  if (d === "amanha") return "Amanhã";
  return "Pendente";
}

type VisualTone = "danger" | "ok" | "muted" | "info";

function moneyColorByTone(t: VisualTone) {
  if (t === "danger") return "text-red-200";
  if (t === "muted") return "text-slate-200";
  if (t === "info") return "text-sky-200";
  return "text-emerald-300";
}

function moneyColorByDue(d: DueStatus, fallbackTone: VisualTone) {
  if (d === "atrasado") return "text-red-200";
  if (d === "hoje") return "text-amber-100";
  if (d === "amanha") return "text-sky-100";
  return moneyColorByTone(fallbackTone);
}

function EmprestimoCardPasta({
  emprestimo,
  onRemover,
  onPagar,
  onComprovante,
  pagamentosMapa,
}: {
  emprestimo: Emprestimo;
  onRemover: (id: string) => void;
  onPagar?: (e: Emprestimo) => void;
  onComprovante?: (e: Emprestimo) => void;
  pagamentosMapa?: Record<string, PagamentoDb[]>;
}) {
  const pagamentosMapaSafe = pagamentosMapa ?? {};
  const navigate = useNavigate();
  const [detalhesAberto, setDetalhesAberto] = useState(false);
  const [renegociarAberto, setRenegociarAberto] = useState(false);
  const [jurosCfgAberto, setJurosCfgAberto] = useState(false);
  const [multaAberto, setMultaAberto] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);

  const refetchEmprestimos = useEmprestimosStore((s) => s.fetchEmprestimos);
  const safeRefetch = () => { void refetchEmprestimos(); };

  const due = getDueStatusEmprestimo(emprestimo);
  // Fonte local de parcelas (compatibilidade com telas/detalhes).
  // Em alguns fluxos (fallback/primeiro render), parcelasDb pode não existir.
  const parcelas = useMemo(() => {
    const v = (emprestimo as any)?.parcelasDb;
    return Array.isArray(v) ? (v as any[]) : [];
  }, [emprestimo]);
  const status = useMemo(() => String((emprestimo as any).status ?? "").toLowerCase(), [emprestimo]);
  const isCancelado = status === "cancelado";
  const isAdiantado = status === "adiantado";
  const isQuitado = useMemo(() => {
    if (status === "quitado") return true;
    // Só infere quitado quando temos parcelas no banco.
    // Caso contrário (ex.: contrato recém-criado que ainda não retornou parcelas),
    // deixa como não quitado para evitar falsos positivos.
    const todas = parcelas;
    if (todas.length === 0) return false;
    const abertas = todas.filter((p) => !p?.pago);
    return abertas.length === 0;
  }, [parcelas, status]);

  const visualTone: VisualTone = useMemo(() => {
    if (isCancelado) return "muted";
    if (isQuitado) return "ok";
    if (status === "atrasado" || due === "atrasado") return "danger";
    if (isAdiantado) return "info";
    return "ok";
  }, [due, isCancelado, isQuitado, isAdiantado, status]);

  const totalEmprestado = Number((emprestimo as any).valor ?? 0);
  // IMPORTANTÍSSIMO:
  // Após amortização, o total correto vem da soma das parcelas do banco.
  // (o payload pode continuar com o total antigo)
  const totalReceber = parcelas.length > 0 ? sumParcelasValor(parcelas) : Number((emprestimo as any).totalReceber ?? 0);
  const totalPago =
    sumPagamentos(pagamentosMapaSafe?.[emprestimo.id]) ||
    sumRecebido(parcelas);
  const restante = parcelas.length > 0 ? sumRestante(parcelas) : Math.max(totalReceber - totalPago, 0);
  const lucroPrevisto = Math.max(totalReceber - totalEmprestado, 0);
  const lucroRealizado = Math.max(totalPago - totalEmprestado, 0);

  const jurosPorParcela = (() => {
    const aplicado = String((emprestimo as any).jurosAplicado ?? "") as string;
    if (aplicado === "por_parcela") {
      const n = Math.max(1, Number((emprestimo as any).numeroParcelas ?? 1));
      return lucroPrevisto / n;
    }
    return lucroPrevisto;
  })();

  const atraso = calcularJurosAtrasoEstimado(emprestimo);
  const multa = calcularMultaEstimado(emprestimo);


// Exibição: o valor principal do card deve refletir multa/juros configurados,
// sem duplicar o que já foi gravado nas parcelas (multa_valor / juros_atraso).
const multaAplicada = (parcelas ?? []).reduce((acc: number, p: any) => {
  if (p?.pago) return acc;
  return acc + Number(p?.multa_valor ?? 0);
}, 0);

const jurosAplicado = (parcelas ?? []).reduce((acc: number, p: any) => {
  if (p?.pago) return acc;
  return acc + Number(p?.juros_atraso ?? 0);
}, 0);

const restanteSemMulta = sumRestanteSemMulta(parcelas);
const multaJaRefletidaNoRestante = Math.max(0, Number(restante ?? 0) - Number(restanteSemMulta ?? 0));
const multaManualFaltante = Math.max(0, Math.max(0, multaAplicada) - Math.max(0, multaJaRefletidaNoRestante));

const multaConfigurada = Math.max(0, Number(multa.total ?? 0));
const jurosConfigurado = Math.max(0, Number(atraso.total ?? 0));
const multaExtra = Math.max(0, multaConfigurada - Math.max(0, multaAplicada, multaJaRefletidaNoRestante));
const jurosExtra = Math.max(0, jurosConfigurado - Math.max(0, jurosAplicado));
const restanteExibido = Math.max(0, Number(restante ?? 0) + multaManualFaltante + multaExtra + jurosExtra);
  const proximaAberta = proximaParcelaAberta(emprestimo);
  const modalidadeLabel = String((emprestimo as any).modalidade ?? "mensal").toUpperCase();
  const proximoVenc = proximoVencimentoEmprestimo(emprestimo);

  const totalParcelasCount = useMemo(() => {
    if (parcelas.length > 0) return parcelas.length;
    const n1 = Number((emprestimo as any).numeroParcelas ?? 0);
    const n2 = Number((emprestimo as any)?.payload?.parcelas ?? 0);
    return Math.max(n1 || 0, n2 || 0, 0);
  }, [parcelas, emprestimo]);

  const pagasCount = useMemo(() => (parcelas ?? []).filter((p) => Boolean(p?.pago)).length, [parcelas]);
  const restantesCount = Math.max(totalParcelasCount - pagasCount, 0);
  const progressoPct = totalParcelasCount > 0 ? Math.round((pagasCount / totalParcelasCount) * 100) : 0;

  const cronogramaParcelas = useMemo(() => {
    const arr = Array.isArray(parcelas) ? [...parcelas] : [];
    arr.sort((a: any, b: any) => {
      const na = Number(a?.numero ?? 0);
      const nb = Number(b?.numero ?? 0);
      if (na !== nb) return na - nb;
      return String(a?.vencimento ?? '').localeCompare(String(b?.vencimento ?? ''));
    });
    return arr;
  }, [parcelas]);

  const clienteTelefone = String((emprestimo as any).clienteContato ?? (emprestimo as any).clienteTelefone ?? (emprestimo as any).telefone ?? '');
  const clienteEndereco = (() => {
    const e = (emprestimo as any);
    const direct = String(e?.clienteEndereco ?? e?.endereco ?? '');
    if (direct) return direct;
    const rua = String(e?.clienteRua ?? e?.rua ?? '');
    const num = String(e?.clienteNumero ?? e?.numero ?? '');
    const bairro = String(e?.clienteBairro ?? e?.bairro ?? '');
    const cidade = String(e?.clienteCidade ?? e?.cidade ?? '');
    const parts = [rua && num ? `${rua}, ${num}` : rua || num, bairro, cidade].filter(Boolean);
    return parts.join(' • ');
  })();

  const dataContrato = String((emprestimo as any).dataContrato ?? (emprestimo as any).created_at ?? (emprestimo as any).createdAt ?? '');
  const dataInicio = String((emprestimo as any).inicio ?? (emprestimo as any).dataInicio ?? (emprestimo as any).inicioContrato ?? '');
  const tipoJuros = String((emprestimo as any).tipoJuros ?? (emprestimo as any).jurosTipo ?? (emprestimo as any)?.payload?.tipo_juros ?? 'Simples');
  const modoJuros = String((emprestimo as any).jurosAplicado ?? (emprestimo as any)?.payload?.juros_aplicado ?? 'total');
  const modoJurosLabel = modoJuros === 'por_parcela' ? 'Por Parcela' : 'Total';

  const cobrancasAtraso = Number(
    (emprestimo as any).cobrancasAtraso ?? (emprestimo as any).cobrancas_whatsapp ?? (emprestimo as any).cobrancasWhatsapp ?? 0
  );

  const irDetalhes = () => navigate(`/emprestimos/${(emprestimo as any).id}`);

  const montarMensagemPadraoWhatsApp = () => {
    const modal = String((emprestimo as any).modalidade ?? "").toLowerCase();
    const ehSemanalOuQuinzenal = modal.includes("semanal") || modal.includes("quinzenal");
    const key = atraso?.detalhe
      ? ehSemanalOuQuinzenal
        ? "atraso_semanal"
        : "atraso_mensal"
      : ehSemanalOuQuinzenal
        ? "cobranca_semanal"
        : "cobranca_mensal";

    const prox = proximaAberta || cronogramaParcelas[0] || {};
    const vars = {
      CLIENTE: (emprestimo as any).clienteNome ?? "Cliente",
      VALOR: brl(Number(prox?.valor ?? emprestimo.valorParcela ?? 0)),
      PARCELA: String(prox?.numero ?? 1),
      DATA: String(prox?.vencimento ?? proximoVenc ?? ""),
      PIX: lsGet("cfg_pix", ""),
      ASSINATURA: lsGet("cfg_assinatura", ""),
      DIAS_ATRASO: String(atraso?.detalhe?.dias ?? 0),
    };

    return fillTemplate(getMessageTemplate(key as any), vars);
  };

  const abrirWhatsapp = (mensagem?: string) => {
    const phoneRaw =
      (emprestimo as any)?.clienteContato ??
      (emprestimo as any)?.cliente_contato ??
      (emprestimo as any)?.telefone ??
      "";
    const phone = String(phoneRaw).replace(/\D/g, "");
    if (!phone) {
      alert("Cliente sem telefone cadastrado.");
      return;
    }
    const waPhone = phone.startsWith("55") ? phone : `55${phone}`;
    const texto = mensagem ?? montarMensagemPadraoWhatsApp();
    const url = `https://wa.me/${waPhone}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      alert("Não foi possível abrir o WhatsApp em uma nova aba (bloqueio de pop-up). Libere pop-ups para este site e tente novamente.");
    }
  };

  const emprestimoModal = useMemo(() => {
    return {
      ...(emprestimo as any),
      restante,
      totalReceber,
      lucroPrevisto,
    };
  }, [emprestimo, restante, totalReceber, lucroPrevisto]);

  return (
    <div className={`w-full min-w-0 rounded-2xl border bg-gradient-to-b ${dueCardTone(due)} ${glowClass(due)} ${pulseClass(due)}`}>
      <RenegociarDividaModal open={renegociarAberto} onClose={() => { setRenegociarAberto(false); safeRefetch(); }} emprestimo={emprestimoModal} />
      <JurosAtrasoConfigModal open={jurosCfgAberto} onClose={() => { setJurosCfgAberto(false); safeRefetch(); }} onSaved={() => safeRefetch()} emprestimo={emprestimo} />
      <AplicarMultaModal open={multaAberto} onClose={() => { setMultaAberto(false); safeRefetch(); }} onSaved={() => safeRefetch()} emprestimo={emprestimo} />
      <PagamentosSidepanel open={historicoAberto} onClose={() => setHistoricoAberto(false)} emprestimo={emprestimo} />
      <EditarEmprestimoModal open={editarAberto} onClose={() => setEditarAberto(false)} onSaved={() => safeRefetch()} emprestimo={emprestimo} />

      <div className="p-4">
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-center">
          <div className="truncate text-white font-semibold">{String((emprestimo as any).clienteNome ?? "Cliente")}</div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-100 text-sm font-extrabold border border-emerald-500/20">
              {initials(String((emprestimo as any).clienteNome ?? "Cliente"))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isCancelado ? (
                <span className="inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/15 px-2.5 py-1 text-[11px] text-slate-100">
                  Cancelado ⛔
                </span>
              ) : isQuitado ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-100">
                  Quitado ✅
                </span>
              ) : isAdiantado ? (
                <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/15 px-2.5 py-1 text-[11px] text-sky-100">
                  Adiantado ⚡
                </span>
              ) : (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${badgeToneByDue(due)}`}>
                  {labelByDue(due)}
                </span>
              )}
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                {modalidadeLabel}
              </span>

              {(emprestimo as any)?.payload?.multa_config ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-100">
                  Multa ⚡
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDetalhesAberto((s) => !s)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold hover:bg-white/10 ${
                detalhesAberto
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/80"
              }`}
            >
              <span aria-hidden>{detalhesAberto ? "▴" : "▾"}</span>
              Detalhes
            </button>

            <button
              type="button"
              onClick={() => onComprovante?.(emprestimo)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/10"
            >
              Comprovante
            </button>
          </div>
        </div>

        <div className="mt-4 text-center">
          <div className={`text-4xl font-extrabold tracking-tight ${moneyColorByDue(due, visualTone)}`}>{brl(restanteExibido)}</div>
          <div className="mt-1 text-xs text-white/60">
            restante a receber
            {jurosExtra > 0 ? <span className="text-red-200/90"> {`(inclui +${brl(jurosExtra)} juros atraso)`}</span> : null}
            {multaAplicada > 0 ? <span className="text-amber-200/90"> {`(multa aplicada ${brl(multaAplicada)})`}</span> : null}
            {multaExtra > 0 ? <span className="text-amber-200/90"> {`(inclui +${brl(multaExtra)} multa)`}</span> : null}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="grid grid-cols-2 gap-px bg-white/10">
          <div className="bg-black/25 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Emprestado</div>
            <div className="mt-1 text-sm font-semibold text-white">{brl(totalEmprestado)}</div>
          </div>

          <div className="bg-black/25 p-3 text-right">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Total a Receber</div>
            <div className="mt-1 text-sm font-semibold text-white">{brl(totalReceber)}</div>
          </div>

          <div className="bg-black/25 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/55">🪙 Lucro Previsto</div>
            <div className="mt-1 text-sm font-semibold text-emerald-200">{brl(lucroPrevisto)}</div>
          </div>

          <div className="bg-black/25 p-3 text-right">
            <div className="text-[11px] uppercase tracking-wide text-white/55">✅ Lucro Realizado</div>
            <div className="mt-1 text-sm font-semibold text-emerald-200">{brl(lucroRealizado)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-white/10">
          <div className="bg-black/25 px-3 py-2 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-white/55">$ Pago:</div>
            <div className="text-sm font-semibold text-emerald-200">{brl(totalPago)}</div>
          </div>
        </div>
      </div>

      {detalhesAberto ? (
        <div className="px-4 pt-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-white/55">📅 Venc:</div>
                  <button
                    type="button"
                    onClick={irDetalhes}
                    className="h-7 w-7 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    title="Editar vencimento"
                  >
                    ✎
                  </button>
                </div>
                <div className="mt-1 text-sm font-semibold text-white">{fmtShort(proximoVenc)}</div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-white/55">💲 Pago:</div>
                  <button
                    type="button"
                    onClick={irDetalhes}
                    className="h-7 w-7 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    title="Editar pagamentos"
                  >
                    ✎
                  </button>
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-200">{brl(totalPago)}</div>
              </div>

              <div className="col-span-2 rounded-xl border border-white/10 bg-violet-500/10 px-3 py-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-violet-100">Só Juros (por parcela):</div>
                <div className="text-sm font-extrabold text-violet-100">{brl(Math.max(jurosPorParcela, 0))}</div>
              </div>
            </div>

            {/* NOVO: botões pedidos no card */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJurosCfgAberto(true)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-black/30"
              >
                ⚙️ Juros por atraso
              </button>
              <button
                type="button"
                onClick={() => setMultaAberto(true)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-black/30"
              >
                💰 Aplicar multa
              </button>
            </div>
          </div>

          {atraso.detalhe ? (
            <div className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-semibold text-red-100">
                  Parcela {atraso.detalhe.parcelaNumero}/{atraso.detalhe.totalParcelas} em atraso
                </div>
                <div className="text-[12px] font-semibold text-red-100">{atraso.detalhe.dias} dias</div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-white/80">
                <div>
                  <div className="text-white/60">Vencimento</div>
                  <div className="font-semibold text-white">{fmtShort(atraso.detalhe.vencimento)}</div>
                </div>
                <div className="text-right">
                  <div className="text-white/60">Valor</div>
                  <div className="font-semibold text-white">{brl(atraso.detalhe.valorParcela)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-white/60">
                    % Juros ({atraso.detalhe.tipo === "percentual_por_dia" ? `${atraso.detalhe.taxa}%/dia` : `${brl(atraso.detalhe.taxa)}/dia`})
                  </div>
                  <div className="mt-0.5 font-semibold text-red-100">+{brl(atraso.total)}</div>
                </div>
                {multaAplicada > 0 ? (
                  <div className="col-span-2">
                    <div className="text-white/60">Multa aplicada (manual)</div>
                    <div className="mt-0.5 font-semibold text-amber-100">+{brl(multaAplicada)}</div>
                  </div>
                ) : null}
                {multaExtra > 0 ? (
                  <div className="col-span-2">
                    <div className="text-white/60">Multa pendente (config)</div>
                    <div className="mt-0.5 font-semibold text-amber-100">+{brl(multaExtra)}</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setJurosCfgAberto(true)}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-black/30"
                >
                  ⚙️ Configurar Juros
                </button>
                <button
                  type="button"
                  onClick={() => setMultaAberto(true)}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-black/30"
                >
                  💰 Aplicar Multa
                </button>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={irDetalhes}
                  className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-black/35"
                >
                  ↗ Cobrar Atraso (WhatsApp)
                </button>
                {cobrancasAtraso > 0 ? (
                  <div className="mt-2 text-center text-[11px] font-semibold text-red-200/90">Já cobrou {cobrancasAtraso}x</div>
                ) : (
                  <div className="mt-2 text-[11px] text-white/55">Pague a parcela em atraso para regularizar o empréstimo</div>
                )}
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => onRemover((emprestimo as any).id)}
                  className="h-9 w-9 rounded-xl border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                  title="Excluir"
                >
                  🗑
                </button>
              </div>
            </div>
          ) : proximaAberta ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-semibold text-white/90">
                  Próxima parcela {Number(proximaAberta?.numero ?? 0)}/{Number((emprestimo as any).numeroParcelas ?? (emprestimo as any).payload?.parcelas ?? 0)}
                </div>
                <div className="text-[12px] font-semibold text-white/70">
                  {(() => {
                    const hoje = todayISO();
                    const v = String(proximaAberta?.vencimento ?? "");
                    const dias = Math.max(0, Math.abs(daysDiffISO(hoje, v)));
                    if (!v) return "—";
                    return String(v) < hoje ? `${dias} dias` : `em ${dias} dias`;
                  })()}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-white/80">
                <div>
                  <div className="text-white/60">Vencimento</div>
                  <div className="font-semibold text-white">{fmtShort(String(proximaAberta?.vencimento ?? ""))}</div>
                </div>
                <div className="text-right">
                  <div className="text-white/60">Valor</div>
                  <div className="font-semibold text-white">{brl(Number(proximaAberta?.valor ?? 0))}</div>
                </div>
                <div className="col-span-2 text-[11px] text-white/55">Pague a próxima parcela para manter o empréstimo em dia.</div>
              </div>
            </div>
          ) : null}

          {/* Seção adicional (expansão Detalhes): Progresso / Cronograma / Contato / Contrato */}
          <div className="mt-3 space-y-3">
            {/* Progresso */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-white/90 font-semibold">
                <span aria-hidden>📊</span> Progresso
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-black/30 overflow-hidden border border-white/10">
                <div className="h-full bg-emerald-500/70" style={{ width: `${progressoPct}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px] text-white/70">
                <span>{progressoPct}%</span>
                <span>{pagasCount} de {Math.max(totalParcelasCount, 0)} parcela(s) paga(s) • {restantesCount} restante(s)</span>
              </div>
            </div>

            {/* Cronograma de Parcelas */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-white/90 font-semibold">
                <span aria-hidden>🗓️</span> Cronograma de Parcelas
              </div>
              <div className="mt-3 grid gap-2">
                {(cronogramaParcelas.length > 0 ? cronogramaParcelas : (proximaAberta ? [proximaAberta] : [])).map((p: any, idx: number) => {
                  const venc = String(p?.vencimento ?? "");
                  const hoje = todayISO();
				  const statusParcela = p?.pago === true
                    ? { text: "Paga", tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100" }
                    : venc && venc < hoje
                      ? { text: "Atrasada", tone: "border-red-500/25 bg-red-500/10 text-red-100" }
                      : { text: "Aberta", tone: "border-white/10 bg-white/5 text-white/70" };
                  const numero = Number(p?.numero ?? (idx + 1));
                  const total = Math.max(totalParcelasCount || cronogramaParcelas.length || 1, 1);
                  const valorP = Number(p?.valor ?? 0);
                  return (
                    <div key={`${String((p as any)?.id ?? idx)}-${numero}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-white/90">Parcela {numero}/{total}</div>
                        <div className="mt-0.5 text-[11px] text-white/60">{brl(valorP)} • {fmtShort(venc)}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusParcela.tone}`}>{statusParcela.text}</span>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={irDetalhes} className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">
                Ver detalhes completos
              </button>
            </div>

            {/* Contato do Cliente */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-white/90 font-semibold">
                <span aria-hidden>👤</span> Contato do Cliente
              </div>
              <div className="mt-3 grid gap-2 text-[12px] text-white/80">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-white/60">📞</span>
                  <span className="font-semibold">{clienteTelefone || "—"}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span aria-hidden className="text-white/60 mt-0.5">📍</span>
                  <span className="font-semibold">{clienteEndereco || "—"}</span>
                </div>
              </div>
            </div>

            {/* Detalhes do Contrato */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-white/90 font-semibold">
                <span aria-hidden>📄</span> Detalhes do Contrato
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-white/80">
                <div>
                  <div className="text-white/60">Data do Contrato</div>
                  <div className="font-semibold text-white">{dataContrato ? fmtShort(dataContrato) : "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-white/60">Início</div>
                  <div className="font-semibold text-white">{dataInicio ? fmtShort(dataInicio) : (cronogramaParcelas[0]?.vencimento ? fmtShort(String(cronogramaParcelas[0]?.vencimento)) : "—")}</div>
                </div>
                <div>
                  <div className="text-white/60">Tipo de Juros</div>
                  <div className="font-semibold text-white">{tipoJuros}</div>
                </div>
                <div className="text-right">
                  <div className="text-white/60">Modo de Juros</div>
                  <div className="font-semibold text-white">{modoJurosLabel}</div>
                </div>
                <div>
                  <div className="text-white/60">Total de Juros</div>
                  <div className="font-semibold text-white">{brl(Math.max(lucroPrevisto, 0))}</div>
                </div>
                <div className="text-right">
                  <div className="text-white/60">Tipo de Pagamento</div>
                  <div className="font-semibold text-white">{modalidadeLabel}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* CTA WhatsApp (mantém sempre visível) */}
      <div className="px-4 pt-3">
              <button
                type="button"
                onClick={() => abrirWhatsapp()}
                className={`w-full rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-emerald-500/15 ${
                  atraso.detalhe
                    ? "border-red-500/25 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                    : "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                {atraso.detalhe ? "Cobrar Atraso (WhatsApp)" : "Cobrar via WhatsApp"}
              </button>
      </div>

      <div className="px-4 pt-3 pb-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPagar?.(emprestimo)}
              disabled={isQuitado || isCancelado}
              className={
                "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (isQuitado || isCancelado
                  ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
              }
            >
              <span className="inline-flex items-center justify-center gap-2">
                <span aria-hidden>🧾</span> Pagar
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRenegociarAberto(true)}
              disabled={isQuitado || isCancelado}
              className={
                "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (isQuitado || isCancelado
                  ? "border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10")
              }
            >
              <span className="inline-flex items-center justify-center gap-2">
                <span aria-hidden>💲</span> Pagar Juros
              </span>
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={irDetalhes}
                className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                title="Abrir detalhes"
              >
                ↗
              </button>
              <button
                type="button"
                onClick={() => onComprovante?.(emprestimo)}
                className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                title="Comprovante"
              >
                🧾
              </button>
              <button
                type="button"
                onClick={() => setEditarAberto(true)}
                className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                title="Editar empréstimo e vencimentos"
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={() => setHistoricoAberto(true)}
                className="h-9 w-9 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                title="Ver histórico de pagamentos (pode excluir pagamentos errados)"
              >
                ↺
              </button>
            </div>

            <button
              type="button"
              onClick={() => onRemover((emprestimo as any).id)}
              className="h-9 w-9 rounded-xl border border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15"
              title="Excluir"
            >
              🗑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PastaClienteCard({
  clienteNome,
  emprestimos,
  groupDue,
  onAbrirPasta,
  pagamentosMapa,
}: {
  clienteNome: string;
  emprestimos: Emprestimo[];
  groupDue: DueStatus;
  onAbrirPasta: () => void;
  pagamentosMapa?: Record<string, PagamentoDb[]>;
}) {
  const pagamentosMapaSafe = pagamentosMapa ?? {};
  const totalEmprestado = useMemo(
    () => emprestimos.reduce((acc, e) => acc + Number((e as any).valor ?? 0), 0),
    [emprestimos]
  );
  const totalReceber = useMemo(() => {
    return emprestimos.reduce((acc, e) => {
      const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
      const total = parcelas.length > 0 ? sumParcelasValor(parcelas) : Number((e as any).totalReceber ?? 0);
      return acc + total;
    }, 0);
  }, [emprestimos]);
  const totalPago = useMemo(() => {
    return emprestimos.reduce((acc, e) => {
      const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
      return acc + (sumPagamentos(pagamentosMapaSafe?.[(e as any).id]) || sumRecebido(parcelas));
    }, 0);
  }, [emprestimos, pagamentosMapaSafe]);

  const restante = useMemo(() => {
    // soma do saldo pendente real (considera parciais/adiantamentos)
    return emprestimos.reduce((acc, e) => {
      const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
      if (parcelas.length === 0) {
        const tr = Number((e as any).totalReceber ?? 0);
        // fallback simples
        return acc + Math.max(tr, 0);
      }
      return acc + sumRestante(parcelas);
    }, 0);
  }, [emprestimos]);
  const lucroPrevisto = Math.max(totalReceber - totalEmprestado, 0);

  const badge = dueBadge(groupDue);

  return (
    <div className={`w-full min-w-0 rounded-2xl border bg-gradient-to-b ${dueCardTone(groupDue)} ${glowClass(groupDue)} ${pulseClass(groupDue)}`}>
      <div className="p-4 sm:p-4">
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-center">
          <div className="truncate text-white font-semibold">{clienteNome}</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-100 text-sm font-extrabold border border-emerald-500/20">
            {initials(clienteNome)}
          </div>

          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] ${chipTone("muted")}`}>
            📁 {emprestimos.length} empréstimos
          </span>

          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] ${chipTone(badge.tone)}`}>
            <span aria-hidden>{badge.icon}</span> {badge.text}
          </span>
        </div>

        <div className="mt-4 text-center">
          <div className="text-4xl font-extrabold tracking-tight text-white">{brl(restante)}</div>
          <div className="mt-1 text-xs text-white/60">restante a receber</div>
        </div>
      </div>

      <div className="mt-1 border-t border-white/10">
        <div className="grid grid-cols-2 gap-px bg-white/10">
          <div className="bg-black/25 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Emprestado</div>
            <div className="mt-1 text-lg font-semibold text-white">{brl(totalEmprestado)}</div>
          </div>

          <div className="bg-black/25 p-3 text-right">
            <div className="text-[11px] uppercase tracking-wide text-white/55">Total a receber</div>
            <div className="mt-1 text-lg font-semibold text-white">{brl(totalReceber)}</div>
          </div>

          <div className="bg-black/25 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/55">🪙 Lucro previsto</div>
            <div className="mt-1 text-lg font-semibold text-white">{brl(lucroPrevisto)}</div>
          </div>

          <div className="bg-black/25 p-3 text-right">
            <div className="text-[11px] uppercase tracking-wide text-white/55">✅ Recebido</div>
            <div className="mt-1 text-lg font-semibold text-emerald-300">{brl(totalPago)}</div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 pb-4">
        <div className="text-[12px] font-semibold tracking-wide text-white/60">EMPRÉSTIMOS NA PASTA</div>

        <div className="mt-3 grid gap-2">
          {emprestimos.slice(0, 4).map((e) => {
            const venc = proximoVencimentoEmprestimo(e);
            return (
              <div
                key={(e as any).id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-white/90">
                    <span className="text-white/60">$</span>
                    <span className="font-semibold">{brl(Number((e as any).valor ?? 0))}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/55">• Venc: {fmtShort(venc)}</div>
                </div>

                <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-semibold text-white">
                  {brl(Number((e as any).totalReceber ?? 0))}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAbrirPasta}
          className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
        >
          <span className="flex items-center justify-center gap-2">
            <span aria-hidden>📁</span>
            <span>Abrir Pasta</span>
            <span className="ml-1" aria-hidden>
              ›
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

export default function EmprestimosLista({
  viewMode = "grid",
  lista,
  onRemover,
  onPagar,
  onComprovante,
  pagamentosMapa,
}: Props) {
  const pagamentosMapaSafe = pagamentosMapa ?? {};
  const [pastaAbertaKey, setPastaAbertaKey] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const map = new Map<string, { key: string; clienteNome: string; clienteIdForRoute?: string; emprestimos: Emprestimo[] }>();

    for (const e of lista) {
      const clienteNome = String((e as any).clienteNome ?? "Cliente");
      const clienteId = (e as any).clienteId as string | undefined;

      const key = clienteId || `${clienteNome}::${String((e as any).clienteContato ?? "")}`;
      const curr = map.get(key);
      if (curr) curr.emprestimos.push(e);
      else map.set(key, { key, clienteNome, clienteIdForRoute: clienteId, emprestimos: [e] });
    }

    const arr = Array.from(map.values()).map((g) => {
      const groupDue: DueStatus = g.emprestimos.reduce((best, emp) => {
        const parcelas = Array.isArray((emp as any).parcelasDb) ? (emp as any).parcelasDb : [];
        const d = getDueStatus(parcelas);
        return prio(d) < prio(best) ? d : best;
      }, "ok" as DueStatus);

      return { ...g, groupDue };
    });

    arr.sort((a, b) => {
      const pa = prio(a.groupDue);
      const pb = prio(b.groupDue);
      if (pa !== pb) return pa - pb;
      return a.clienteNome.localeCompare(b.clienteNome);
    });

    return arr;
  }, [lista]);

  const pastaAberta = useMemo(() => {
    if (!pastaAbertaKey) return null;
    return grupos.find((g) => g.key === pastaAbertaKey) ?? null;
  }, [grupos, pastaAbertaKey]);

  useEffect(() => {
    if (!pastaAbertaKey) return;
    if (!pastaAberta) setPastaAbertaKey(null);
  }, [pastaAbertaKey, pastaAberta]);

  if (viewMode !== "grid") {
    // Mantém compatibilidade: caso tenha toggle de lista/tabela, não quebra.
  }

  if (pastaAberta) {
    const totalReceber = pastaAberta.emprestimos.reduce((acc, e) => {
      const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
      const total = parcelas.length > 0 ? sumParcelasValor(parcelas) : Number((e as any).totalReceber ?? 0);
      return acc + total;
    }, 0);
    const totalPago = pastaAberta.emprestimos.reduce((acc, e) => {
      const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
      return acc + (sumPagamentos(pagamentosMapaSafe?.[(e as any).id]) || sumRecebido(parcelas));
    }, 0);
    const restante = pastaAberta.emprestimos.reduce((acc, e) => {
      const parcelas = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
      if (parcelas.length === 0) return acc + Math.max(Number((e as any).totalReceber ?? 0) - 0, 0);
      return acc + sumRestante(parcelas);
    }, 0);

    return (
      <div className="w-full">
        <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPastaAbertaKey(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            <span aria-hidden>×</span> Voltar
          </button>

          <div className="min-w-0 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-100 text-sm font-extrabold border border-emerald-500/20">
              {initials(pastaAberta.clienteNome)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-white font-semibold">{pastaAberta.clienteNome}</div>
              <div className="text-[12px] text-white/60">
	                {pastaAberta.emprestimos.length} empréstimos • Receber:{" "}
	                <span className="text-white/90 font-semibold">{brl(totalReceber)}</span>
	                <span className="mx-1">•</span>
	                Pago: <span className="text-white/90 font-semibold">{brl(totalPago)}</span>
	                <span className="mx-1">•</span>
	                Restante: <span className="text-emerald-200 font-semibold">{brl(restante)}</span>
              </div>
            </div>
          </div>

          <div className="w-[96px]" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {pastaAberta.emprestimos.map((e) => (
            <EmprestimoCardPasta
              key={(e as any).id}
              emprestimo={e}
              onRemover={onRemover}
              onPagar={onPagar}
              onComprovante={onComprovante}
              pagamentosMapa={pagamentosMapaSafe}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
      {grupos.map((g, idx) => {
        if (g.emprestimos.length <= 1) {
          const e = g.emprestimos[0];
          return (
            <EmprestimoCardPasta
              key={(e as any)?.id ?? g.key ?? `${g.clienteNome}-${idx}`}
              emprestimo={e}
              onRemover={onRemover}
              onPagar={onPagar}
              onComprovante={onComprovante}
              pagamentosMapa={pagamentosMapaSafe}
            />
          );
        }
        return (
          <PastaClienteCard
            key={g.key ?? `${g.clienteNome}-${idx}`}
            clienteNome={g.clienteNome}
            emprestimos={g.emprestimos}
            groupDue={g.groupDue}
            pagamentosMapa={pagamentosMapaSafe}
            onAbrirPasta={() => setPastaAbertaKey(g.key)}
          />
        );
      })}
    </div>
  );
}
