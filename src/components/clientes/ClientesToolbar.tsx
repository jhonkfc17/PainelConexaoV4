// src/components/clientes/ClientesToolbar.tsx
type Props = {
  busca: string;
  onChangeBusca: (value: string) => void;
};

export default function ClientesToolbar({ busca, onChangeBusca }: Props) {
  return (
    <div className="rounded-2xl border border-emerald-500/10 bg-slate-900/10 p-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-emerald-500/10 bg-slate-950/40 px-3 py-2">
          <span className="text-slate-400">🔎</span>
          <input
            value={busca}
            onChange={(e) => onChangeBusca(e.target.value)}
            placeholder="Buscar clientes..."
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
        </div>
      </div>
    </div>
  );
}
