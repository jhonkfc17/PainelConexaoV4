export default function EmprestimosTop() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Empréstimos</h1>
        <p className="text-sm text-white/60">Gerencie seus empréstimos</p>
      </div>

      <div className="flex items-center gap-2">
        <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">
          Tutorial
        </button>
        <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">
          Baixar Relatório
        </button>
      </div>
    </div>
  );
}
