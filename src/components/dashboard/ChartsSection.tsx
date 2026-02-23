import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
  Legend,
} from "recharts";

import type { ReactNode } from "react";
import type { DashboardSeriesPoint } from "../../services/dashboard.service";

type Series = {
  title: string;
  data: DashboardSeriesPoint[];
  keys: string[];
  yFormat?: "brl" | "percent";
};

type Props = {
  evolucao: Series;
  juros: Series;
  inadimplencia: Series;
  aVencer: Series;
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-emerald-500/15 bg-white/5 p-4 min-w-0">
      <div className="text-sm font-semibold text-white/80">{title}</div>

      {/* ✅ altura fixa + min-w-0 + overflow para o ResponsiveContainer medir corretamente */}
      <div className="mt-3 h-56 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">
        <div className="h-full w-full min-w-0">{children}</div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-white/40">
      Sem dados suficientes ainda.
    </div>
  );
}

function hasAny(series: Series): boolean {
  return (series.data ?? []).some((d) =>
    series.keys.some((k) => Number(d[k] ?? 0) > 0)
  );
}

function formatYAxis(v: any, yFormat?: Series["yFormat"]): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (yFormat === "percent") return `${n}%`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function formatTooltip(value: any, name: any, yFormat?: Series["yFormat"]) {
  const n = Number(value);
  const v = Number.isFinite(n) ? n : 0;
  if (yFormat === "percent") return [`${v.toFixed(1)}%`, String(name)];
  return [brl(v), String(name)];
}

function SeriesChart({ series }: { series: Series }) {
  if (!hasAny(series)) return <EmptyState />;

  const lines = series.keys.map((k) => ({ key: k, name: k }));

  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
          <YAxis
            tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
            tickFormatter={(v) => formatYAxis(v, series.yFormat)}
          />
          <Tooltip
            formatter={(value: any, name: any) => formatTooltip(value, name, series.yFormat)}
            labelStyle={{ color: "rgba(0,0,0,0.8)" }}
          />
          {lines.length > 1 ? <Legend /> : null}

          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={
                l.key === "emprestado"
                  ? "Emprestado"
                  : l.key === "recebido"
                    ? "Recebido"
                    : l.key === "juros"
                      ? "Juros"
                      : l.key === "inadimplencia"
                        ? "Inadimplência"
                        : l.key === "aVencer"
                          ? "A vencer"
                          : l.key
              }
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ChartsSection({ evolucao, juros, inadimplencia, aVencer }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 min-w-0">
      <Box title={evolucao.title}>
        <SeriesChart series={evolucao} />
      </Box>

      <Box title={juros.title}>
        <SeriesChart series={{ ...juros, yFormat: "brl" }} />
      </Box>

      <Box title={inadimplencia.title}>
        <SeriesChart series={{ ...inadimplencia, yFormat: "percent" }} />
      </Box>

      <Box title={aVencer.title}>
        <SeriesChart series={{ ...aVencer, yFormat: "brl" }} />
      </Box>
    </div>
  );
}