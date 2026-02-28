import React, { useEffect, useMemo, useState } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CircleDollarSign,
  Download,
  Plus,
  RefreshCcw,
  Wallet,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { listEmprestimos, type Emprestimo, type ParcelaDb } from "@/services/emprestimos.service";

type MoneyRow = { label: string; value: number };

type Status = "em_atraso" | "hoje" | "ok";

type ContratoAtivoRow = {
  cliente: string;
  emprestado: number;
  pago: number;
  falta: number;
  status: Status;
  vencimento: string;
};

type ContratoAtrasoRow = {
  cliente: string;
  atraso: number;
  emprestado: number;
  vencimento: string;
  ticket: string;
};

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBR(dISO: string): string {
  if (!dISO) return "-";
  const [y, m, d] = dISO.slice(0, 10).split("-");
  if (!y || !m || !d) return "-";
  return `${d}/${m}/${y}`;
}

function toISODateOnly(v: any): string {
  const s = String(v ?? "");
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function safeNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    em_atraso: { label: "Em Atraso", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
    hoje: { label: "Hoje", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    ok: { label: "Em Dia", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${s.cls}`}>
      {s.label}
    </span>
  );
}

function Card({
  icon,
  title,
  value,
  subtitle,
  tone = "emerald",
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle?: string;
  tone?: "emerald" | "amber" | "red" | "purple";
}) {
  const toneCls: Record<string, string> = {
    emerald: "border-emerald-500/25",
    amber: "border-amber-500/25",
    red: "border-red-500/25",
    purple: "border-purple-500/25",
  };
  return (
    <div className={`rounded-xl border ${toneCls[tone]} bg-slate-950/35 shadow-glow backdrop-blur-md p-4`}>
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">{icon}</span>
        <div className="font-medium">{title}</div>
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {subtitle ? <div className="mt-0.5 text-[11px] text-slate-400">{subtitle}</div> : null}
    </div>
  );
}

function SectionBox({
  title,
  rows,
  total,
  variant,
}: {
  title: string;
  rows: MoneyRow[];
  total: number;
  variant: "out" | "in";
}) {
  const isOut = variant === "out";
  return (
    <div
      className={
        "rounded-2xl border bg-slate-950/30 shadow-glow backdrop-blur-md overflow-hidden " +
        (isOut ? "border-red-500/25" : "border-emerald-500/25")
      }
    >
      <div className={"px-4 py-3 text-xs font-semibold tracking-wide " + (isOut ? "text-red-300" : "text-emerald-300")}>
        {title}
      </div>
      <div className={"border-t " + (isOut ? "border-red-500/15" : "border-emerald-500/15")}>
        {rows.map((r) => (
          <div
            key={r.label}
            className={
              "flex items-center justify-between px-4 py-2 text-sm border-b last:border-b-0 " +
              (isOut ? "border-red-500/10" : "border-emerald-500/10")
            }
          >
            <div className="flex items-center gap-2 text-slate-200">
              <span
                className={
                  "inline-flex h-4 w-4 items-center justify-center rounded border " +
                  (isOut ? "border-red-500/25 bg-red-500/10" : "border-emerald-500/25 bg-emerald-500/10")
                }
              />
              <span className="text-[13px]">{r.label}</span>
            </div>
            <div className={"text-[13px] font-semibold " + (isOut ? "text-red-300" : "text-emerald-300")}>
              {isOut ? "-" : "+"}
              {brl(Math.abs(r.value))}
            </div>
          </div>
        ))}
      </div>

      <div className={"px-4 py-2 text-right text-sm font-semibold " + (isOut ? "text-red-300" : "text-emerald-300")}>
        {isOut ? "-" : "+"}
        {brl(Math.abs(total))}
      </div>
    </div>
  );
}

function parcelaPagoValor(p: ParcelaDb): number {
  const v = (p as any).valor_pago_acumulado ?? (p as any).valor_pago ?? 0;
  return Math.max(0, safeNumber(v));
}

function parcelaSaldoRestante(p: ParcelaDb): number {
  const saldo = (p as any).saldo_restante;
  if (saldo != null) return Math.max(0, safeNumber(saldo));
  const valor = safeNumber((p as any).valor ?? 0);
  return Math.max(0, valor - parcelaPagoValor(p));
}

function parcelasAbertas(e: Emprestimo): ParcelaDb[] {
  const ps = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as ParcelaDb[]) : [];
  return ps.filter((p) => parcelaSaldoRestante(p) > 0.00001);
}

function sumSaldo(ps: ParcelaDb[]): number {
  return ps.reduce((a, p) => a + parcelaSaldoRestante(p), 0);
}

function sumPago(ps: ParcelaDb[]): number {
  return ps.reduce((a, p) => a + parcelaPagoValor(p), 0);
}

function sumAtraso(ps: ParcelaDb[], hoje: string): number {
  return ps
    .filter((p) => {
      const v = toISODateOnly((p as any).vencimento);
      return v && v < hoje;
    })
    .reduce((a, p) => a + parcelaSaldoRestante(p), 0);
}

function nextVencimento(ps: ParcelaDb[]): string {
  const dates = ps
    .map((p) => toISODateOnly((p as any).vencimento))
    .filter(Boolean)
    .sort();
  return dates[0] ?? "";
}

function statusContrato(psAbertas: ParcelaDb[], hoje: string): Status {
  const venc = nextVencimento(psAbertas);
  const atraso = sumAtraso(psAbertas, hoje);
  if (atraso > 0.00001) return "em_atraso";
  if (venc && venc === hoje) return "hoje";
  return "ok";
}

export default function RelatorioOperacional() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [pagamentosMes, setPagamentosMes] = useState<{ valor: number; juros_atraso: number | null }[]>([]);

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const inicioMesISO = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  async function carregar() {
    setLoading(true);
    setError(null);
    try {
      const [emp, pays] = await Promise.all([
        listEmprestimos(),
        supabase
          .from("pagamentos")
          .select("valor, juros_atraso, data_pagamento, estornado_em")
          .gte("data_pagamento", inicioMesISO)
          .lte("data_pagamento", hojeISO)
          .is("estornado_em", null),
      ]);

      setEmprestimos((emp ?? []) as any);
      if (pays.error) throw pays.error;
      setPagamentosMes(
        ((pays.data ?? []) as any[]).map((p) => ({
          valor: safeNumber(p.valor),
          juros_atraso: p.juros_atraso == null ? null : safeNumber(p.juros_atraso),
        }))
      );
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Falha ao carregar dados do relatório.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emprestimosAtivos = useMemo(() => {
    return emprestimos.filter((e) => String((e as any).status ?? "").toLowerCase() !== "quitado");
  }, [emprestimos]);

  const pagamentosRecebidosMes = useMemo(() => pagamentosMes.reduce((a, p) => a + safeNumber(p.valor), 0), [pagamentosMes]);
  const jurosRecebidosMes = useMemo(() => pagamentosMes.reduce((a, p) => a + safeNumber(p.juros_atraso ?? 0), 0), [pagamentosMes]);

  const emprestimosConcedidosMes = useMemo(() => {
    return emprestimos
      .filter((e) => {
        const createdISO = toISODateOnly((e as any).createdAt ?? (e as any).created_at);
        return createdISO && createdISO >= inicioMesISO && createdISO <= hojeISO;
      })
      .reduce((a, e) => a + safeNumber((e as any).valor ?? 0), 0);
  }, [emprestimos, inicioMesISO, hojeISO]);

  const { capitalNaRua, emAtraso } = useMemo(() => {
    let naRua = 0;
    let atraso = 0;
    for (const e of emprestimosAtivos) {
      const ab = parcelasAbertas(e);
      naRua += sumSaldo(ab);
      atraso += sumAtraso(ab, hojeISO);
    }
    return { capitalNaRua: naRua, emAtraso: atraso };
  }, [emprestimosAtivos, hojeISO]);

  const jurosPrevistos = useMemo(() => {
    const totalReceber = emprestimosAtivos.reduce((a, e) => a + safeNumber((e as any).totalReceber ?? 0), 0);
    const principal = emprestimosAtivos.reduce((a, e) => a + safeNumber((e as any).valor ?? 0), 0);
    return Math.max(0, totalReceber - principal);
  }, [emprestimosAtivos]);

  const pagoTotalAtivos = useMemo(() => {
    return emprestimosAtivos.reduce((a, e) => a + sumPago((e as any).parcelasDb ?? []), 0);
  }, [emprestimosAtivos]);

  const jurosAReceber = useMemo(() => {
    // Sem histórico consolidado de pagamentos, estimamos o "a receber" do período como:
    // juros previstos em contratos ativos - juros recebidos no mês.
    return Math.max(0, jurosPrevistos - jurosRecebidosMes);
  }, [jurosPrevistos, jurosRecebidosMes]);

  const resultadoPeriodo = useMemo(() => {
    // Resultado do período (mês atual) = entradas - saídas.
    // Não existe módulo de contas fixas/avulsas no projeto (logo, 0 aqui).
    return pagamentosRecebidosMes - emprestimosConcedidosMes;
  }, [pagamentosRecebidosMes, emprestimosConcedidosMes]);

  const indicadores = useMemo(() => {
    return {
      capitalNaRua,
      jurosAReceber,
      totalRecebido: pagamentosRecebidosMes,
      jurosRecebidos: jurosRecebidosMes,
      emAtraso,
      lucroRealizado: jurosRecebidosMes,
    };
  }, [capitalNaRua, jurosAReceber, pagamentosRecebidosMes, jurosRecebidosMes, emAtraso]);

  const saidas: MoneyRow[] = useMemo(
    () => [
      { label: "Empréstimos concedidos", value: emprestimosConcedidosMes },
      { label: "Contas a pagar (fixas)", value: 0 },
      { label: "Contas avulsas", value: 0 },
    ],
    [emprestimosConcedidosMes]
  );

  const entradas: MoneyRow[] = useMemo(
    () => [
      { label: "Pagamentos recebidos", value: pagamentosRecebidosMes },
      { label: "Outros ganhos", value: jurosRecebidosMes },
      { label: "Em atraso", value: emAtraso },
    ],
    [pagamentosRecebidosMes, jurosRecebidosMes, emAtraso]
  );

  const distribuicao = useMemo(
    () => [
      { label: "Na Rua", valor: indicadores.capitalNaRua },
      { label: "Recebido", valor: indicadores.totalRecebido },
      { label: "Pendente", valor: indicadores.jurosAReceber },
      { label: "Atraso", valor: indicadores.emAtraso },
    ],
    [indicadores]
  );

  const evolucaoMensal = useMemo(() => {
    // Sem tabela de histórico, usamos uma série estável para manter o layout,
    // baseada no snapshot atual (evita inventar valores por mês).
    const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const now = new Date();
    const out: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        label: labels[d.getMonth()],
        naRua: indicadores.capitalNaRua,
        emprestado: emprestimosConcedidosMes,
        lucro: indicadores.lucroRealizado,
      });
    }
    return out;
  }, [indicadores.capitalNaRua, indicadores.lucroRealizado, emprestimosConcedidosMes]);

  const contratosAtivos: ContratoAtivoRow[] = useMemo(() => {
    return emprestimosAtivos
      .map((e) => {
        const ab = parcelasAbertas(e);
        const venc = nextVencimento(ab);
        const pago = sumPago((e as any).parcelasDb ?? []);
        const falta = Math.max(0, safeNumber((e as any).totalReceber ?? 0) - pago);
        return {
          cliente: String((e as any).clienteNome ?? ""),
          emprestado: safeNumber((e as any).valor ?? 0),
          pago,
          falta,
          status: statusContrato(ab, hojeISO),
          vencimento: formatBR(venc),
        };
      })
      .sort((a, b) => {
        const orderStatus = (s: Status) => (s === "em_atraso" ? 0 : s === "hoje" ? 1 : 2);
        const ds = orderStatus(a.status) - orderStatus(b.status);
        if (ds !== 0) return ds;
        return (a.vencimento ?? "").localeCompare(b.vencimento ?? "");
      })
      .slice(0, 5);
  }, [emprestimosAtivos, hojeISO]);

  const contratosAtraso: ContratoAtrasoRow[] = useMemo(() => {
    return emprestimosAtivos
      .map((e) => {
        const ab = parcelasAbertas(e);
        const atraso = sumAtraso(ab, hojeISO);
        if (!(atraso > 0.00001)) return null;

        const venc = nextVencimento(
          ab.filter((p) => {
            const v = toISODateOnly((p as any).vencimento);
            return v && v < hojeISO;
          })
        );

        return {
          cliente: String((e as any).clienteNome ?? ""),
          atraso,
          emprestado: safeNumber((e as any).valor ?? 0),
          vencimento: formatBR(venc),
          // não existe "ticket" no banco; mantemos a coluna para preservar layout.
          ticket: String((e as any).id ?? "").slice(0, 8),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.atraso - a.atraso)
      .slice(0, 5) as ContratoAtrasoRow[];
  }, [emprestimosAtivos, hojeISO]);

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-white">Fluxo de Caixa</div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              {loading ? "Carregando" : error ? "Erro" : "Ao vivo"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Veja o saldo acumulado por período, quais contas pagaram e suas entradas e saídas, e o valor final da
            comparação.
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Período: {formatBR(inicioMesISO)} até {formatBR(hojeISO)}
          </div>
          {error ? <div className="mt-2 text-[11px] text-red-300">{error}</div> : null}
        </div>

        <button
          type="button"
          onClick={() => alert("Adicionar: em breve")}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15"
        >
          <Plus size={16} />
          Adicionar
        </button>
      </div>

      {/* Saídas / Entradas */}
      <div className="mt-4 grid grid-cols-1 gap-3">
        <SectionBox title="SAÍDAS" rows={saidas} total={saidas.reduce((a, b) => a + b.value, 0)} variant="out" />
        <SectionBox title="ENTRADAS" rows={entradas} total={entradas.reduce((a, b) => a + b.value, 0)} variant="in" />
      </div>

      {/* Resultado do período */}
      <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 shadow-glow backdrop-blur-md px-4 py-6 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300">
          <CircleDollarSign size={16} /> Resultado do Período
        </div>
        <div className="mt-1 text-2xl font-extrabold text-emerald-200">
          {resultadoPeriodo >= 0 ? "+" : "-"}
          {brl(Math.abs(resultadoPeriodo))}
        </div>
        <div className="mt-0.5 text-[11px] text-emerald-200/70">ENTRADAS - SAÍDAS DO CAIXA</div>
      </div>

      {/* 3 cards grandes */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-300">
            <Wallet size={16} /> Na Rua
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-200">{brl(indicadores.capitalNaRua)}</div>
          <div className="mt-1 text-[11px] text-amber-200/70">VALOR A RECEBER</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300">
            <CircleDollarSign size={16} /> Lucro
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-200">{brl(indicadores.lucroRealizado)}</div>
          <div className="mt-1 text-[11px] text-emerald-200/70">JUROS RECEBIDOS (PERÍODO)</div>
        </div>

        <div className="rounded-2xl border border-purple-500/25 bg-purple-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-purple-300">
            <CircleDollarSign size={16} /> Pago
          </div>
          <div className="mt-2 text-2xl font-extrabold text-purple-200">{brl(pagoTotalAtivos)}</div>
          <div className="mt-1 text-[11px] text-purple-200/70">TOTAL PAGO EM CONTRATOS ATIVOS</div>
        </div>
      </div>

      {/* Linha de cards */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card icon={<Wallet size={16} />} title="Capital na Rua" value={brl(indicadores.capitalNaRua)} subtitle="Em contratos ativos" tone="emerald" />
        <Card icon={<ArrowUpCircle size={16} />} title="Juros a Receber" value={brl(indicadores.jurosAReceber)} subtitle="Estimado" tone="amber" />
        <Card icon={<ArrowDownCircle size={16} />} title="Total Recebido" value={brl(indicadores.totalRecebido)} subtitle="No período" tone="emerald" />
        <Card icon={<CircleDollarSign size={16} />} title="Juros Recebidos" value={brl(indicadores.jurosRecebidos)} subtitle="No período" tone="emerald" />
        <Card icon={<AlertTriangle size={16} />} title="Em Atraso" value={brl(indicadores.emAtraso)} subtitle="Saldo vencido" tone="red" />
        <Card icon={<CircleDollarSign size={16} />} title="Lucro Realizado" value={brl(indicadores.lucroRealizado)} subtitle="Juros recebidos" tone="purple" />
      </div>

      {/* Gráficos */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Evolução Mensal</div>
            <button
              type="button"
              onClick={() => void carregar()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
              title="Recarregar"
            >
              <RefreshCcw size={14} />
              Atualizar
            </button>
          </div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="label" strokeOpacity={0.6} />
                <YAxis strokeOpacity={0.6} />
                <Tooltip />
                <Line type="monotone" dataKey="naRua" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="emprestado" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lucro" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            * Gráfico mantém o layout (histórico mensal depende de uma tabela de histórico para ficar 100% fiel).
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md p-4">
          <div className="text-sm font-semibold text-white">Distribuição</div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribuicao}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="label" strokeOpacity={0.6} />
                <YAxis strokeOpacity={0.6} />
                <Tooltip />
                <Bar dataKey="valor" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabelas */}
      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-sm font-semibold text-white">Contratos Ativos (Na Rua)</div>
            <button
              type="button"
              onClick={() => alert("Exportar: em breve")}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              <Download size={14} />
              Exportar
            </button>
          </div>

          <div className="border-t border-white/10">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold text-slate-400">
              <div className="col-span-4">Cliente</div>
              <div className="col-span-2 text-right">Emprestado</div>
              <div className="col-span-2 text-right">Pago</div>
              <div className="col-span-2 text-right">Falta</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-1 text-right">Venc.</div>
            </div>

            {contratosAtivos.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400">Nenhum contrato ativo encontrado.</div>
            ) : (
              contratosAtivos.map((r, idx) => (
                <div
                  key={`${r.cliente}-${idx}`}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-white/5"
                >
                  <div className="col-span-4 text-slate-200 truncate">{r.cliente || "-"}</div>
                  <div className="col-span-2 text-right text-emerald-200 font-semibold">{brl(r.emprestado)}</div>
                  <div className="col-span-2 text-right text-slate-200">{brl(r.pago)}</div>
                  <div className="col-span-2 text-right text-slate-200">{brl(r.falta)}</div>
                  <div className="col-span-1 flex justify-center">
                    <StatusPill status={r.status} />
                  </div>
                  <div className="col-span-1 text-right text-slate-300">{r.vencimento}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-red-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-sm font-semibold text-white">Contratos em Atraso</div>
            <button
              type="button"
              onClick={() => alert("Exportar: em breve")}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              <Download size={14} />
              Exportar
            </button>
          </div>

          <div className="border-t border-white/10">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold text-slate-400">
              <div className="col-span-4">Cliente</div>
              <div className="col-span-2 text-right">Atraso</div>
              <div className="col-span-2 text-right">Emprestado</div>
              <div className="col-span-2 text-right">Venc.</div>
              <div className="col-span-2 text-right">Ticket</div>
            </div>

            {contratosAtraso.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400">Nenhum contrato em atraso.</div>
            ) : (
              contratosAtraso.map((r, idx) => (
                <div
                  key={`${r.cliente}-${idx}`}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-white/5"
                >
                  <div className="col-span-4 text-slate-200 truncate">{r.cliente || "-"}</div>
                  <div className="col-span-2 text-right text-red-300 font-semibold">{brl(r.atraso)}</div>
                  <div className="col-span-2 text-right text-slate-200">{brl(r.emprestado)}</div>
                  <div className="col-span-2 text-right text-slate-300">{r.vencimento}</div>
                  <div className="col-span-2 text-right text-slate-400">{r.ticket}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
