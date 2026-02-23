type Props = {
  onClickTutorial: () => void;
  onClickBaixarRelatorio: () => void;
};

export default function EmprestimosHeader({ onClickTutorial, onClickBaixarRelatorio }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center items-start justify-between gap-3 sm:gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Empréstimos</h1>
        <p className="text-sm text-white/60">Gerencie seus empréstimos</p>
      </div>

      <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2">
        <button
          onClick={onClickTutorial}
          className="w-full sm:w-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
        >
          Tutorial
        </button>
        <button
          onClick={onClickBaixarRelatorio}
          className="w-full sm:w-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
        >
          Baixar Relatório
        </button>
      </div>
    </div>
  );
}
