import { useMemo } from "react";
import { SelectPremium } from "../ui/SelectPremium";

export type FiltrosChips =
  | "em_aberto"
  | "todos"
  | "em_dia"
  | "vence_hoje"
  | "pagos"
  | "atraso"
  | "reneg"
  | "so_juros"
  | "semanal"
  | "quinzenal"
  | "mensal"
  | "unica";

type Props = {
  ativo: FiltrosChips;
  onChange: (v: FiltrosChips) => void;

  atrasoFaixa: "todos" | "1_7" | "8_30" | "31_plus";
  onChangeAtrasoFaixa: (v: Props["atrasoFaixa"]) => void;

  contadores: Partial<Record<FiltrosChips, number>>;
};

function Chip({
  label,
  active,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-1 text-sm transition",
        "bg-black/20 border-white/10 text-white/80 hover:bg-white/5",
        active ? "ring-1 ring-white/20 bg-white/10 text-white" : "",
        className,
      ].join(" ")}
      type="button"
    >
      {label}
    </button>
  );
}

export default function EmprestimosFiltrosBar({
  ativo,
  onChange,
  atrasoFaixa,
  onChangeAtrasoFaixa,
  contadores,
}: Props) {
  const count = useMemo(() => (k: FiltrosChips) => contadores[k] ?? 0, [contadores]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Chip label={`Em Aberto`} active={ativo === "em_aberto"} onClick={() => onChange("em_aberto")} className="bg-blue-500/10 border-blue-400/30 text-blue-200" />
      <Chip label={`Todos`} active={ativo === "todos"} onClick={() => onChange("todos")} />
      <Chip label={`Em Dia`} active={ativo === "em_dia"} onClick={() => onChange("em_dia")} className="bg-sky-500/10 border-sky-400/30 text-sky-200" />
      <Chip label={`Vence Hoje`} active={ativo === "vence_hoje"} onClick={() => onChange("vence_hoje")} className="bg-emerald-500/10 border-emerald-400/30 text-emerald-200" />
      <Chip label={`Pagos`} active={ativo === "pagos"} onClick={() => onChange("pagos")} className="bg-emerald-700/10 border-emerald-600/30 text-emerald-200" />

      {/* Atraso + dropdown faixa */}
      <div className="flex items-center gap-2">
        <Chip label={`Atraso`} active={ativo === "atraso"} onClick={() => onChange("atraso")} className="bg-red-500/10 border-red-400/30 text-red-200" />
        <SelectPremium
          value={atrasoFaixa}
          onChange={(v) => onChangeAtrasoFaixa(v as any)}
          className="h-8 rounded-xl border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-sm text-white/80"
          options={[
            { value: "todos", label: "Todos" },
            { value: "1_7", label: "1–7 dias" },
            { value: "8_30", label: "8–30 dias" },
            { value: "31_plus", label: "31+ dias" },
          ]}
        />
      </div>

      <Chip label={`Reneg.`} active={ativo === "reneg"} onClick={() => onChange("reneg")} className="bg-yellow-500/10 border-yellow-400/30 text-yellow-200" />
      <Chip label={`Só Juros`} active={ativo === "so_juros"} onClick={() => onChange("so_juros")} className="bg-fuchsia-500/10 border-fuchsia-400/30 text-fuchsia-200" />
      <Chip label={`Semanal`} active={ativo === "semanal"} onClick={() => onChange("semanal")} className="bg-orange-500/10 border-orange-400/30 text-orange-200" />
      <Chip label={`Quinzenal`} active={ativo === "quinzenal"} onClick={() => onChange("quinzenal")} className="bg-teal-500/10 border-teal-400/30 text-teal-200" />
      <Chip label={`Mensal`} active={ativo === "mensal"} onClick={() => onChange("mensal")} className="bg-green-500/10 border-green-400/30 text-green-200" />
      <Chip label={`Única`} active={ativo === "unica"} onClick={() => onChange("unica")} className="bg-gray-500/10 border-gray-400/30 text-gray-200" />

      {/* (Opcional) contador — se quiser colocar “(0)” nos chips, você pode usar count() */}
      <div className="ml-auto text-xs text-white/40">
        {`Total exibido: ${count("todos")}`}
      </div>
    </div>
  );
}