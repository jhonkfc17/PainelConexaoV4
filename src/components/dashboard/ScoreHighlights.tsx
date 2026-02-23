import { useEffect, useMemo, useState } from "react";
import { listarScoreClientes, type ClienteScore } from "../../services/score.service";

function Badge({ faixa }: { faixa: ClienteScore["faixa"] }) {
  const cls =
    faixa === "A"
      ? "border-emerald-500/40 text-emerald-200"
      : faixa === "B"
        ? "border-sky-500/40 text-sky-200"
        : faixa === "C"
          ? "border-amber-500/40 text-amber-200"
          : "border-rose-500/40 text-rose-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      <span className="font-semibold">{faixa}</span>
    </span>
  );
}

function Row({ s }: { s: ClienteScore }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/10 bg-slate-950/30 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-100">{s.nome}</div>
        <div className="truncate text-xs text-slate-400">
          {s.telefone || s.email || "—"}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge faixa={s.faixa} />
        <span className="rounded-full border border-slate-700/70 bg-slate-900/40 px-3 py-1 text-xs text-slate-100">
          {s.score}
        </span>
      </div>
    </div>
  );
}

export default function ScoreHighlights() {
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<ClienteScore[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const list = await listarScoreClientes();
        if (!alive) return;
        setScores(list);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setError(e?.message || "Falha ao carregar score.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { top, worst, resumo } = useMemo(() => {
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 5);
    const worst = [...sorted].reverse().slice(0, 5);

    const resumo = { A: 0, B: 0, C: 0, D: 0 };
    for (const s of scores) resumo[s.faixa] += 1;

    return { top, worst, resumo };
  }, [scores]);

  return (
    <div className="rounded-2xl border border-emerald-500/10 bg-slate-950/30 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-100">Score de clientes</div>
          <div className="text-sm text-slate-400">
            Ranking baseado em parcelas pagas em dia (por usuário logado).
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">
            A: {resumo.A}
          </span>
          <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-sky-200">
            B: {resumo.B}
          </span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-200">
            C: {resumo.C}
          </span>
          <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-200">
            D: {resumo.D}
          </span>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 text-sm text-slate-400">Carregando score…</div>
      ) : scores.length === 0 ? (
        <div className="mt-4 text-sm text-slate-400">
          Nenhum dado ainda. Crie empréstimos e marque parcelas como pagas para gerar score.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">Top 5</div>
            {top.map((s) => (
              <Row key={s.clienteId} s={s} />
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">Piores 5</div>
            {worst.map((s) => (
              <Row key={s.clienteId} s={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
