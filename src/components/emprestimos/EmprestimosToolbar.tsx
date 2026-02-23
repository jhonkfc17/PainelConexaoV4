type StatusFiltro = "todos" | "atrasado" | "hoje" | "amanha";

type Props = {
  busca: string;
  onBuscaChange: (v: string) => void;
  filtrosAbertos: boolean;
  onToggleFiltros: () => void;
  onNovoEmprestimo: () => void;

  statusFiltro: StatusFiltro;
  onStatusFiltroChange: (v: StatusFiltro) => void;
  contadoresStatus: { atrasado: number; hoje: number; amanha: number; total: number };

  viewMode: "grid" | "list";
  onViewModeChange: (m: "grid" | "list") => void;
};

function chipClass(active: boolean, tone: "muted" | "danger" | "warn" | "info") {
  const base =
    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors";
  const off = "bg-white/5 border-white/10 text-white/70 hover:bg-white/10";

  if (!active) return `${base} ${off}`;

  if (tone === "danger") return `${base} bg-red-500/15 border-red-500/30 text-red-100`;
  if (tone === "warn") return `${base} bg-amber-500/15 border-amber-500/30 text-amber-100`;
  if (tone === "info") return `${base} bg-sky-500/15 border-sky-500/30 text-sky-100`;
  return `${base} bg-emerald-500/15 border-emerald-500/30 text-emerald-100`;
}

export default function EmprestimosToolbar({
  busca,
  onBuscaChange,
  filtrosAbertos,
  onToggleFiltros,
  onNovoEmprestimo,

  statusFiltro,
  onStatusFiltroChange,
  contadoresStatus,

  viewMode,
  onViewModeChange,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex-1">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <span className="text-white/50">🔎</span>
          <input
            value={busca}
            onChange={(e) => onBuscaChange(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
        </div>

        <div className="mt-2 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={onToggleFiltros}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15"
          >
            Filtros {filtrosAbertos ? "▲" : "▼"}
          </button>

          {/* Filtros rápidos por vencimento */}
          <button
            type="button"
            onClick={() => onStatusFiltroChange("todos")}
            className={chipClass(statusFiltro === "todos", "muted")}
            title="Mostrar todos"
          >
            Todos ({contadoresStatus.total})
          </button>

          <button
            type="button"
            onClick={() => onStatusFiltroChange("atrasado")}
            className={chipClass(statusFiltro === "atrasado", "danger")}
            title="Parcelas vencidas (em atraso)"
          >
            Atrasado ({contadoresStatus.atrasado})
          </button>

          <button
            type="button"
            onClick={() => onStatusFiltroChange("hoje")}
            className={chipClass(statusFiltro === "hoje", "warn")}
            title="Vence hoje"
          >
            Hoje ({contadoresStatus.hoje})
          </button>

          <button
            type="button"
            onClick={() => onStatusFiltroChange("amanha")}
            className={chipClass(statusFiltro === "amanha", "info")}
            title="Vence amanhã"
          >
            Amanhã ({contadoresStatus.amanha})
          </button>
        </div>
      </div>

      <div className="flex w-full flex-col sm:flex-row items-stretch sm:items-center gap-2 md:w-auto">
        <button
          onClick={onNovoEmprestimo}
          className="w-full sm:w-auto rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
        >
          + Novo Empréstimo
        </button>

        <div className="flex w-full sm:w-auto overflow-hidden rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            className={
              viewMode === "grid"
                ? "bg-white/10 px-3 py-2 text-white"
                : "bg-black/20 px-3 py-2 text-white/70 hover:bg-white/10"
            }
            title="Cards"
          >
            ▦
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            className={
              viewMode === "list"
                ? "bg-white/10 px-3 py-2 text-white"
                : "bg-black/20 px-3 py-2 text-white/70 hover:bg-white/10"
            }
            title="Lista"
          >
            ≡
          </button>
        </div>
      </div>
    </div>
  );
}
