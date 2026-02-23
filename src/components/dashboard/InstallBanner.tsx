type Props = {
  title: string;
  desc: string;
  button: string;
  onClick: () => void;
};

export default function InstallBanner({ title, desc, button, onClick }: Props) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm text-white/70">{desc}</div>
        </div>

        <button
          onClick={onClick}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
        >
          {button}
        </button>
      </div>
    </div>
  );
}
