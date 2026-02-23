import React from "react";

export type EmprestimosTab = "emprestimos" | "diario" | "tabela_price" | "recebimentos" | "calendario";

type Props = {
  tab: EmprestimosTab;
  onChange: (t: EmprestimosTab) => void;
  contadores?: { emprestimos?: number; diario?: number };
};

function TabBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "rc-btn-primary" : "rc-btn-outline"}
    >
      {label}
    </button>
  );
}

export default function EmprestimosTabs({ tab, onChange, contadores }: Props) {
  const cEmp = contadores?.emprestimos ?? 0;
  const cDia = contadores?.diario ?? 0;

  return (
    <div className="flex flex-wrap gap-2">
      <TabBtn
        active={tab === "emprestimos"}
        label={`Empréstimos${cEmp ? ` (${cEmp})` : ""}`}
        onClick={() => onChange("emprestimos")}
      />
      <TabBtn
        active={tab === "diario"}
        label={`Diário${cDia ? ` (${cDia})` : ""}`}
        onClick={() => onChange("diario")}
      />
      <TabBtn
        active={tab === "tabela_price"}
        label="Tabela Price"
        onClick={() => onChange("tabela_price")}
      />
      <TabBtn
        active={tab === "recebimentos"}
        label="Recebimentos"
        onClick={() => onChange("recebimentos")}
      />
      <TabBtn
        active={tab === "calendario"}
        label="Calendário"
        onClick={() => onChange("calendario")}
      />
    </div>
  );
}