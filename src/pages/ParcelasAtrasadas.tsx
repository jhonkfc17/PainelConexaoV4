import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type ParcelaRow = {
  id?: string;
  emprestimo_id?: string;
  vencimento: string; // YYYY-MM-DD
  valor: number | null;
  pago: boolean | null;
  valor_pago: number | null;
  juros_atraso: number | null;
};

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ParcelasAtrasadas() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParcelaRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const hoje = todayISO();

        const { data, error } = await supabase
          .from("parcelas")
          .select("id, emprestimo_id, vencimento, valor, pago, valor_pago, valor_pago_acumulado, juros_atraso")
          .eq("pago", false)
          .lt("vencimento", hoje)
          .order("vencimento", { ascending: true })
          .limit(250);

        if (error) throw error;

        if (!alive) return;
        setRows(
          (data ?? []).map((r: any) => ({
            ...r,
            valor_pago: r.valor_pago ?? r.valor_pago_acumulado ?? null,
          })) as ParcelaRow[]
        );
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Falha ao carregar parcelas atrasadas.");
      } finally {
	      if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const total = useMemo(() => {
    return rows.reduce((acc, r) => acc + Number(r.valor ?? 0), 0);
  }, [rows]);

  return (
    <div className="mx-auto w-full max-w-full sm:max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Parcelas em atraso</div>
          <div className="text-xs text-white/50">
            Total: <span className="text-white/80 font-semibold">{rows.length}</span> • Soma:{" "}
            <span className="text-white/80 font-semibold">{brl(total)}</span>
          </div>
        </div>

        <button className="rc-btn-outline" onClick={() => navigate(-1)}>
          Voltar
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 text-sm text-white/60">Carregando…</div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-slate-950/40 p-4 text-sm text-white/70">
          Nenhuma parcela em atraso 🎉
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((r, idx) => {
          const valor = Number(r.valor ?? 0);
          const juros = Number(r.juros_atraso ?? 0);
          const totalParcela = Math.max(0, valor + juros);

          return (
            <button
              key={String(r.id ?? `${r.emprestimo_id}-${idx}`)}
              className="text-left rounded-2xl border border-red-500/20 bg-red-500/10 p-4 hover:bg-red-500/15 transition focus:outline-none focus:ring-2 focus:ring-red-300/30"
              onClick={() => {
                if (r.emprestimo_id) navigate(`/emprestimos/${r.emprestimo_id}`);
              }}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-white/60">Vencimento</div>
                  <div className="text-sm font-semibold text-white">{r.vencimento}</div>
                </div>
                <div className="text-xs text-red-200/90">Abrir empréstimo ›</div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                  <div className="text-[11px] text-white/50">Valor</div>
                  <div className="text-sm font-semibold text-white">{brl(valor)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
                  <div className="text-[11px] text-white/50">Total c/ juros</div>
                  <div className="text-sm font-semibold text-white">{brl(totalParcela)}</div>
                </div>
              </div>

              <div className="mt-2 text-[11px] text-white/45">
                Empréstimo: <span className="text-white/70">{r.emprestimo_id ?? "—"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
