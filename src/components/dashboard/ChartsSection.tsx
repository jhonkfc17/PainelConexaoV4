import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type GraficoLucroMensalRow = {
  mes_ref: string;
  lucro_mes: number;
};

export default function ChartsSection({ data }: { data: GraficoLucroMensalRow[] }) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 p-4 min-w-0">
      <div className="text-sm font-semibold text-white/80">Lucro mensal (últimos meses)</div>
      <div className="mt-3 h-72 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes_ref" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="lucro_mes" name="Lucro (R$)" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
