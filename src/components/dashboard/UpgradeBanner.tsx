type Props = {
  title: string;
  desc: string;
  button: string;
  onClick: () => void;
};

export default function UpgradeBanner({ title, desc, button, onClick }: Props) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/25 p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 whitespace-pre-line text-sm text-white/80">
            {desc}
          </div>
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
