type Props = {
  score: number;
  status: string;
  desc: string;
  bars: { label: string; value: string }[];
  noteTitle: string;
  noteDesc: string;
};

export default function OperationHealth({
  score,
  status,
  desc,
  bars,
  noteTitle,
  noteDesc,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <div className="rounded-2xl border border-emerald-500/15 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200">
            {score}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Saúde da Operação</div>
            <div className="text-xs text-white/60">{status}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-white/60">{desc}</div>

        <div className="mt-4 h-2 w-full rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {bars.map((b) => (
            <div
              key={b.label}
              className="rounded-2xl border border-emerald-500/15 bg-black/20 p-3"
            >
              <div className="text-xs text-white/60">{b.label}</div>
              <div className="mt-1 text-sm font-semibold text-white">{b.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/15 bg-white/5 p-4">
        <div className="text-sm font-semibold text-white">{noteTitle}</div>
        <div className="mt-2 text-sm text-white/60">{noteDesc}</div>
      </div>
    </div>
  );
}
