import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export type GraficoLucroMensalRow = {
  mes_ref: string;
  lucro_mes: number;
};

export default function ChartsSection({ data }: { data: GraficoLucroMensalRow[] }) {
  const max = Math.max(0, ...(data ?? []).map((d) => Number(d.lucro_mes ?? 0)));
  const tickFormatter = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-900/40 p-4 min-w-0 shadow-[0_18px_40px_rgba(16,185,129,0.08)]">
      <div className="flex items-center justify-between text-sm text-white/80">
        <div className="font-semibold">Lucro mensal (últimos meses)</div>
        <div className="text-xs text-emerald-200/80">Barra mostra lucro líquido por mês</div>
      </div>

      <div className="mt-3 h-72 min-w-0 overflow-hidden rounded-xl border border-white/5 bg-slate-950/50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="2 4" strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="mes_ref" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
              tickFormatter={tickFormatter}
              domain={[0, max * 1.1 || 1]}
            />
            <Tooltip
              formatter={(value) =>
                `R$ ${(Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              }
              labelStyle={{ color: "#0f172a" }}
              contentStyle={{ background: "#0f172a", border: "1px solid #10b981", borderRadius: 12 }}
            />
            <ReferenceLine y={0} stroke="#10b981" strokeOpacity={0.35} />
            <Bar
              dataKey="lucro_mes"
              name="Lucro (R$)"
              radius={[10, 10, 4, 4]}
              fill="url(#lucroGradient)"
              maxBarSize={42}
            />
            <defs>
              <linearGradient id="lucroGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
