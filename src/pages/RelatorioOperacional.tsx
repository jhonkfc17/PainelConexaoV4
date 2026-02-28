import React from "react";

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

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    em_atraso: { label: "Em Atraso", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
    hoje: { label: "Hoje", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    ok: { label: "Em Dia", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  };
  const s = map[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${s.cls}`}>{s.label}</span>;
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

export default function RelatorioOperacional() {
  // UI fiel ao layout da tela enviada. Os valores abaixo estão alinhados com o print.
  // Se quiser conectar com dados reais depois, é só manter o mesmo shape e substituir as constantes.

  const saidas: MoneyRow[] = [
    { label: "Empréstimos concedidos", value: 5620 },
    { label: "Contas a pagar (fixas)", value: 4429 },
    { label: "Contas avulsas", value: 0 },
  ];
  const entradas: MoneyRow[] = [
    { label: "Pagamentos recebidos", value: 6294.96 },
    { label: "Outros ganhos", value: 6294.96 },
    { label: "Em atraso", value: 1341 },
  ];

  const resultadoPeriodo = 864.98;
  const naRua = 1350;
  const lucro = 3619.98;

  const indicadores = {
    capitalNaRua: 3555,
    jurosAReceber: 821,
    totalRecebido: 6294.96,
    jurosRecebidos: 1716,
    emAtraso: 1341,
    lucroRealizado: 3619.98,
  };

  const evolucaoMensal = [
    { label: "Jan", naRua: 0, emprestado: 0, lucro: 0 },
    { label: "Fev", naRua: 0, emprestado: 0, lucro: 0 },
    { label: "Mar", naRua: 0, emprestado: 0, lucro: 0 },
    { label: "Abr", naRua: 0, emprestado: 0, lucro: 0 },
    { label: "Mai", naRua: 0, emprestado: 0, lucro: 0 },
    { label: "Jun", naRua: 520, emprestado: 410, lucro: 280 },
    { label: "Jul", naRua: 1350, emprestado: 920, lucro: 620 },
  ];

  const distribuicao = [
    { label: "Na Rua", valor: 3555 },
    { label: "Recebido", valor: 6294.96 },
    { label: "Pendente", valor: 821 },
    { label: "Atraso", valor: 1341 },
  ];

  const contratosAtivos: ContratoAtivoRow[] = [
    { cliente: "User 5", emprestado: 630, pago: 0, falta: 945, status: "em_atraso", vencimento: "17/02/2026" },
    {
      cliente: "JHON KELVIN FERNANDES CARDOSO 2",
      emprestado: 1000,
      pago: 0,
      falta: 1500,
      status: "hoje",
      vencimento: "19/02/2026",
    },
    { cliente: "user3", emprestado: 300, pago: 0, falta: 420, status: "em_atraso", vencimento: "17/09/2027" },
    { cliente: "user2", emprestado: 500, pago: 675, falta: 225, status: "em_atraso", vencimento: "20/02/2026" },
    { cliente: "user2", emprestado: 300, pago: 340, falta: 340, status: "hoje", vencimento: "19/02/2026" },
  ];

  const contratosAtraso: ContratoAtrasoRow[] = [
    { cliente: "User 5", atraso: 945, emprestado: 630, vencimento: "17/02/2026", ticket: "389653.00" },
    { cliente: "user3", atraso: 420, emprestado: 300, vencimento: "17/09/2027", ticket: "389653.00" },
    { cliente: "user2", atraso: 225, emprestado: 500, vencimento: "20/02/2026", ticket: "389653.00" },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-white">Fluxo de Caixa</div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              Teste
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Veja o saldo acumulado por período, quais contas pagaram e suas entradas e saídas, e o valor final
            da comparação.
          </div>
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
        <div className="mt-1 text-2xl font-extrabold text-emerald-200">+{brl(resultadoPeriodo)}</div>
        <div className="mt-0.5 text-[11px] text-emerald-200/70">ENTRADAS - SAÍDAS DO CAIXA</div>
      </div>

      {/* 3 cards grandes */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-300">
            <Wallet size={16} /> Na Rua
          </div>
          <div className="mt-2 text-lg font-semibold text-amber-200">{brl(naRua)}</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300">
            <ArrowUpCircle size={16} /> Lucro
          </div>
          <div className="mt-2 text-lg font-semibold text-emerald-200">{brl(lucro)}</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300">
            <ArrowDownCircle size={16} /> Resultado
          </div>
          <div className="mt-2 text-lg font-semibold text-emerald-200">+{brl(resultadoPeriodo)}</div>
        </div>
      </div>

      {/* Indicadores */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Card icon={<Wallet size={16} />} title="Capital na Rua" value={brl(indicadores.capitalNaRua)} subtitle="Em contratos ativos" tone="emerald" />
        <Card icon={<ArrowUpCircle size={16} />} title="Juros a Receber" value={brl(indicadores.jurosAReceber)} subtitle="No período" tone="emerald" />
        <Card icon={<CircleDollarSign size={16} />} title="Total Recebido" value={brl(indicadores.totalRecebido)} subtitle="Histórico" tone="emerald" />
        <Card icon={<CircleDollarSign size={16} />} title="Juros Recebidos" value={brl(indicadores.jurosRecebidos)} subtitle="Saldo acumulado" tone="amber" />
        <Card icon={<AlertTriangle size={16} />} title="Em Atraso" value={brl(indicadores.emAtraso)} subtitle="2 contratos" tone="red" />
        <Card icon={<Download size={16} />} title="Lucro Realizado" value={brl(indicadores.lucroRealizado)} subtitle="Juros já recebidos" tone="purple" />
      </div>

      {/* Gráficos */}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/15 bg-white/5 p-4 min-w-0">
          <div className="text-sm font-semibold text-white/80">Evolução Mensal</div>
          <div className="mt-3 h-56 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={evolucaoMensal} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
                <Tooltip formatter={(value: any, name: any) => [brl(Number(value ?? 0)), String(name)]} labelStyle={{ color: "rgba(0,0,0,0.8)" }} />
                <Line type="monotone" dataKey="naRua" name="Na Rua" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="emprestado" name="Emprestado" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lucro" name="Lucro" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/15 bg-white/5 p-4 min-w-0">
          <div className="text-sm font-semibold text-white/80">Distribuição</div>
          <div className="mt-3 h-56 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={distribuicao} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
                <Tooltip formatter={(value: any) => brl(Number(value ?? 0))} labelStyle={{ color: "rgba(0,0,0,0.8)" }} />
                <Bar dataKey="valor" name="Valor" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabelas */}
      <div className="mt-3 rounded-2xl border border-emerald-500/15 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white/80">Contratos Ativos (Na Rua)</div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
            onClick={() => alert("Atualizar: em breve")}
            title="Atualizar"
          >
            <RefreshCcw size={14} />
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-black/30">
              <tr className="text-left text-xs text-white/60">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Emprestado</th>
                <th className="px-3 py-2">Pago</th>
                <th className="px-3 py-2">Falta</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Vencimento</th>
              </tr>
            </thead>
            <tbody>
              {contratosAtivos.map((r) => (
                <tr key={`${r.cliente}-${r.vencimento}`} className="border-t border-white/10 text-white/80">
                  <td className="px-3 py-2 text-xs">{r.cliente}</td>
                  <td className="px-3 py-2 text-xs">{brl(r.emprestado)}</td>
                  <td className="px-3 py-2 text-xs text-emerald-200">{brl(r.pago)}</td>
                  <td className="px-3 py-2 text-xs">{brl(r.falta)}</td>
                  <td className="px-3 py-2 text-xs">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-white/60">{r.vencimento}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-950/10 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-red-200">Contratos em Atraso</div>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-xs text-red-200">{contratosAtraso.length}</span>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-red-500/20">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-black/30">
              <tr className="text-left text-xs text-white/60">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Atraso</th>
                <th className="px-3 py-2">Emprestado</th>
                <th className="px-3 py-2">Vencimento</th>
                <th className="px-3 py-2">Ticket</th>
              </tr>
            </thead>
            <tbody>
              {contratosAtraso.map((r) => (
                <tr key={`${r.cliente}-${r.vencimento}`} className="border-t border-red-500/10 text-white/80">
                  <td className="px-3 py-2 text-xs">{r.cliente}</td>
                  <td className="px-3 py-2 text-xs text-red-200">{brl(r.atraso)}</td>
                  <td className="px-3 py-2 text-xs">{brl(r.emprestado)}</td>
                  <td className="px-3 py-2 text-xs text-white/60">{r.vencimento}</td>
                  <td className="px-3 py-2 text-xs text-white/60">{r.ticket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
