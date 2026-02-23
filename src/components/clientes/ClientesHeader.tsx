// src/components/clientes/ClientesHeader.tsx

type Props = {
  canCreate?: boolean;

  // novo nome (usado no Clientes.tsx)
  onClickNovoCliente?: () => void;

  // compatibilidade (caso você use em outro lugar)
  onNovoCliente?: () => void;

  onImportarClientes?: () => void;
};

export default function ClientesHeader({ onClickNovoCliente, onNovoCliente, onImportarClientes, canCreate = true }: Props) {
  const handleClick = onClickNovoCliente ?? onNovoCliente;

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Clientes</h1>
        <p className="text-sm text-slate-400">Gerencie seus clientes</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onImportarClientes}
          disabled={!canCreate}
          className={[
            "inline-flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-sm font-semibold transition border",
            canCreate
              ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
              : "border-white/10 bg-white/5 text-white/30 cursor-not-allowed",
          ].join(" ")}
          title={canCreate ? "" : "Sem permissão para importar clientes"}
        >
          <span aria-hidden>⬆️</span>
          Importar CSV
        </button>

        <button
          type="button"
          onClick={handleClick}
          disabled={!canCreate}
          className={[
            "inline-flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-sm font-semibold transition",
            canCreate
              ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              : "bg-slate-800/50 text-slate-400 cursor-not-allowed border border-emerald-500/10",
          ].join(" ")}
          title={canCreate ? "" : "Sem permissão para cadastrar clientes"}
        >
          <span className="text-lg leading-none">+</span>
          Novo Cliente
        </button>
      </div>
    </div>
  );
}
