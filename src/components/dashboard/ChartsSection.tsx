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

export function GraficoLucroMensal({ data }: { data: GraficoLucroMensalRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes_ref" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="lucro_mes" name="Lucro (R$)" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default GraficoLucroMensal;
