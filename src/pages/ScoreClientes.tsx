import { useEffect, useMemo, useState } from "react";
import { listarScoreClientes, type ClienteScore } from "../services/score.service";

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

function fmtPct(x: number) {
  const v = Math.round((x ?? 0) * 100);
  return `${v}%`;
}

export default function ScoreClientes() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lista, setLista] = useState<ClienteScore[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listarScoreClientes();
      setLista(data);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : "Falha ao carregar score.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return lista;
    return lista.filter((c) => {
      const nome = (c.nome ?? "").toLowerCase();
      const tel = (c.telefone ?? "").toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      return nome.includes(query) || tel.includes(query) || email.includes(query);
    });
  }, [lista, q]);

  const resumo = useMemo(() => {
    const total = filtered.length;
    const a = filtered.filter((x) => x.faixa === "A").length;
    const b = filtered.filter((x) => x.faixa === "B").length;
    const c = filtered.filter((x) => x.faixa === "C").length;
    const d = filtered.filter((x) => x.faixa === "D").length;
    return { total, a, b, c, d };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="rc-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Score de Clientes</div>
            <div className="text-xs opacity-70 mt-1">
              O score sobe quando as parcelas são pagas <span className="font-semibold">em dia</span> e cai com atrasos.
            </div>
          </div>

          <button type="button" className="rc-btn-outline" onClick={load} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rc-card p-3">
            <div className="text-xs opacity-70">Clientes</div>
            <div className="text-xl font-semibold">{resumo.total}</div>
          </div>
          <div className="rc-card p-3">
            <div className="text-xs opacity-70">Faixa A</div>
            <div className="text-xl font-semibold">{resumo.a}</div>
          </div>
          <div className="rc-card p-3">
            <div className="text-xs opacity-70">Faixa B</div>
            <div className="text-xl font-semibold">{resumo.b}</div>
          </div>
          <div className="rc-card p-3">
            <div className="text-xs opacity-70">Faixa C</div>
            <div className="text-xl font-semibold">{resumo.c}</div>
          </div>
          <div className="rc-card p-3">
            <div className="text-xs opacity-70">Faixa D</div>
            <div className="text-xl font-semibold">{resumo.d}</div>
          </div>
        </div>

        <div className="mt-4">
          <input
            className="rc-input w-full"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail..."
          />
        </div>

        {err ? <div className="mt-3 text-sm text-rose-200">{err}</div> : null}
      </div>

      <div className="rc-card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-70">
              <th className="py-2 pr-3">Cliente</th>
              <th className="py-2 pr-3">Score</th>
              <th className="py-2 pr-3">Em dia</th>
              <th className="py-2 pr-3">Atrasadas pagas</th>
              <th className="py-2 pr-3">Atrasadas em aberto</th>
              <th className="py-2 pr-3">Taxa em dia</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 opacity-70">
                  {loading ? "Carregando..." : "Nenhum cliente encontrado."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.clienteId} className="border-t border-white/5">
                  <td className="py-3 pr-3">
                    <div className="font-semibold">{c.nome}</div>
                    <div className="text-xs opacity-70">
                      {c.telefone ? c.telefone : ""}
                      {c.telefone && c.email ? " • " : ""}
                      {c.email ? c.email : ""}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <Badge faixa={c.faixa} />
                      <span className="font-semibold">{c.score}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="font-semibold">{c.pagasEmDia}</span>
                    <span className="opacity-70">/{c.totalVencidasAteHoje}</span>
                  </td>
                  <td className="py-3 pr-3">{c.pagasEmAtraso}</td>
                  <td className="py-3 pr-3">{c.emAtrasoNaoPagas}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-white/50"
                          style={{ width: `${Math.round((c.taxaEmDia ?? 0) * 100)}%` }}
                        />
                      </div>
                      <span className="opacity-80">{fmtPct(c.taxaEmDia)}</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-70">
        <div className="font-semibold mb-1">Como o score é calculado</div>
        <div>
          Considera apenas parcelas que <span className="font-semibold">já venceram até hoje</span>. Pagas até o vencimento contam como
          “em dia”. Parcelas pagas depois do vencimento reduzem um pouco o score. Parcelas vencidas e não pagas reduzem mais.
        </div>
      </div>
    </div>
  );
}
