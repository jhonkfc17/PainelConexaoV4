import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-emerald-500/25 bg-slate-950/35 shadow-glow backdrop-blur-md">
      {title && <div className="px-4 pt-4 text-sm font-semibold text-slate-100">{title}</div>}
      <div className="p-4 pt-3">{children}</div>
    </div>
  );
}

const evo = [
  { mes: "Set", emprestado: 0, recebido: 0 },
  { mes: "Out", emprestado: 0, recebido: 0 },
  { mes: "Nov", emprestado: 0, recebido: 0 },
  { mes: "Dez", emprestado: 0, recebido: 0 },
  { mes: "Jan", emprestado: 0, recebido: 0 },
  { mes: "Fev", emprestado: 0, recebido: 0 },
];

const juros = [
  { mes: "Set", jurosNoMes: 0, jurosAcumulados: 0 },
  { mes: "Out", jurosNoMes: 0, jurosAcumulados: 0 },
  { mes: "Nov", jurosNoMes: 0, jurosAcumulados: 0 },
  { mes: "Dez", jurosNoMes: 0, jurosAcumulados: 0 },
  { mes: "Jan", jurosNoMes: 0, jurosAcumulados: 0 },
  { mes: "Fev", jurosNoMes: 0, jurosAcumulados: 0 },
];

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold">Dashboard</div>
        <div className="text-xs text-slate-400">Visão geral do seu sistema financeiro</div>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-emerald-200">Instale o CobraFácil no seu celular</div>
            <div className="text-[11px] text-slate-400 mt-1">
              Tenha acesso rápido direto do seu celular, instante e offline com um app nativo!
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg px-3 py-2 text-xs border border-emerald-500/25 bg-emerald-500/15 hover:bg-emerald-500/20">
              Instalar Agora
            </button>
            <button className="rounded-lg px-3 py-2 text-xs border border-white/10 bg-white/5 hover:bg-white/10">
              Ver instruções
            </button>
          </div>
        </div>
      </Card>

      <div className="rounded-xl border border-blue-400/30 bg-blue-600/35 shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Expanda seu Negócio!</div>
          <div className="text-[11px] text-blue-100/80 mt-1">
            Adicione funcionários para ajudar no dia a dia. A partir de R$ 29,90/mês.
          </div>
          <div className="text-[11px] text-blue-100/70 mt-2">
            ✓ Controle total de permissões • ✓ Acompanhamento de produtividade • ✓ Notificações via WhatsApp • ✓ Relatórios por funcionário
          </div>
        </div>
        <button className="rounded-lg px-3 py-2 text-xs border border-blue-200/30 bg-blue-300/15 hover:bg-blue-300/20">
          Ver Funcionários →
        </button>
      </div>

      <Card title="Resumo da Semana">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { t: "Contratos", v: "0", s: "esta semana" },
            { t: "Recebido", v: "R$ 0,00", s: "esta semana" },
            { t: "Vence hoje", v: "0", s: "cobranças" },
          ].map((x) => (
            <div key={x.t} className="rounded-lg border border-emerald-500/15 bg-slate-950/25 p-3">
              <div className="text-xs text-slate-300">{x.t}</div>
              <div className="mt-2 text-xl font-semibold">{x.v}</div>
              <div className="mt-1 text-[11px] text-slate-500">{x.s}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          {["Empréstimos", "Produtos", "Vendas", "Contatos"].map((t) => (
            <div key={t} className="rounded-lg border border-emerald-500/15 bg-slate-950/25 p-3">
              <div className="text-xs text-slate-300">{t}</div>
              <div className="mt-2 text-xl font-semibold">0</div>
              <div className="mt-1 text-[11px] text-slate-500">esta semana</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Evolução Financeira (Últimos 6 meses)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evo}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="emprestado" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="recebido" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Tendência de Juros Recebidos">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={juros}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="jurosNoMes" strokeWidth={2} dot />
                <Line type="monotone" dataKey="jurosAcumulados" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Saúde da Operação">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full border border-emerald-500/25 bg-emerald-500/10 flex items-center justify-center shadow-glow">
              <div className="text-lg font-bold text-emerald-200">80</div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-300">Tudo ok</div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-[80%] bg-emerald-500/60" />
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Baseado nos dados de recebimento, inadimplência e risco em aberto.
              </div>
            </div>
          </div>
        </Card>

        <Card title="Status">
          <div className="text-sm font-semibold">Tudo em ordem</div>
          <div className="text-[11px] text-slate-400 mt-1">Nenhum alerta no momento. Continue assim!</div>
        </Card>
      </div>
    </div>
  );
}
