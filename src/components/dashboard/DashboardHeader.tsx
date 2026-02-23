type Props = {
  title: string;
  subtitle: string;
  roleLabel: string;
};

export default function DashboardHeader({ title, subtitle, roleLabel }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h1 className="text-xl sm:text-2xl font-semibold text-white break-words">{title}</h1>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] sm:text-xs text-emerald-200">
            {roleLabel}
          </span>
        </div>
        <p className="mt-1 text-sm text-white/60">{subtitle}</p>
      </div>
    </div>
  );
}
