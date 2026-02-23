import { useEffect, useMemo, useState } from "react";

import { listEmprestimos } from "../services/emprestimos.service";
import type { Emprestimo } from "@/store/useEmprestimosStore";

type ParcelaRef = {
  emprestimo: Emprestimo;
  parcela: NonNullable<Emprestimo["parcelasDb"]>[number];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameISO(a: string, b: string): boolean {
  return a === b;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtMonthTitle(d: Date): string {
  const month = d.toLocaleString("pt-BR", { month: "long" });
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${d.getFullYear()}`;
}

function fmtDayTitle(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return `${d} de ${dt.toLocaleString("pt-BR", { month: "long" })}`;
}

function daysDiff(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map((x) => Number(x));
  const [ty, tm, td] = toISO.split("-").map((x) => Number(x));
  const f = new Date(fy, fm - 1, fd);
  const t = new Date(ty, tm - 1, td);
  const ms = t.getTime() - f.getTime();
  return Math.floor(ms / 86_400_000);
}

function computeSoJurosPorParcela(emp: Emprestimo): number {
  const n = Math.max(1, Number(emp.numeroParcelas ?? 1));
  if (emp.jurosAplicado === "por_parcela") {
    return (Number(emp.valor ?? 0) * Number(emp.taxaJuros ?? 0)) / 100;
  }
  return Number(emp.jurosTotal ?? 0) / n;
}

export default function CalendarioVencimentos() {
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);

  const [monthRef, setMonthRef] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedISO, setSelectedISO] = useState<string>(() => toISODate(new Date()));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErro(null);
        const list = await listEmprestimos();
        if (!alive) return;
        setEmprestimos(list);
      } catch (e: any) {
        if (!alive) return;
        setErro(e?.message ?? "Falha ao carregar dados");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openParcelas: ParcelaRef[] = useMemo(() => {
    const out: ParcelaRef[] = [];
    for (const emp of emprestimos) {
      const arr = Array.isArray(emp.parcelasDb) ? emp.parcelasDb : [];
      for (const p of arr) {
        if (p?.pago) continue;
        out.push({ emprestimo: emp, parcela: p });
      }
    }
    return out;
  }, [emprestimos]);

  const monthStart = useMemo(() => startOfMonth(monthRef), [monthRef]);
  const monthEnd = useMemo(() => endOfMonth(monthRef), [monthRef]);
  const monthStartISO = useMemo(() => toISODate(monthStart), [monthStart]);
  const monthEndISO = useMemo(() => toISODate(monthEnd), [monthEnd]);

  const parcelasNoMes = useMemo(() => {
    return openParcelas.filter((x) => x.parcela.vencimento >= monthStartISO && x.parcela.vencimento <= monthEndISO);
  }, [openParcelas, monthStartISO, monthEndISO]);

  const aVencerCount = useMemo(() => parcelasNoMes.filter((x) => x.parcela.vencimento >= todayISO).length, [parcelasNoMes, todayISO]);
  const vencidosCount = useMemo(() => openParcelas.filter((x) => x.parcela.vencimento < todayISO).length, [openParcelas, todayISO]);
  const totalNoMes = useMemo(() => parcelasNoMes.reduce((acc, x) => acc + Number(x.parcela.valor ?? 0), 0), [parcelasNoMes]);

  const byDay = useMemo(() => {
    const map = new Map<string, ParcelaRef[]>();
    for (const x of parcelasNoMes) {
      const k = x.parcela.vencimento;
      const arr = map.get(k) ?? [];
      arr.push(x);
      map.set(k, arr);
    }
    return map;
  }, [parcelasNoMes]);

  const selectedItems = useMemo(() => byDay.get(selectedISO) ?? [], [byDay, selectedISO]);
  const selectedTotal = useMemo(() => selectedItems.reduce((acc, x) => acc + Number(x.parcela.valor ?? 0), 0), [selectedItems]);

  const gridDays = useMemo(() => {
    // semana começa no domingo (Dom ... Sáb) como no layout do print
    const first = new Date(monthStart);
    const startDow = first.getDay(); // 0..6 (Dom..Sáb)
    const start = new Date(first);
    start.setDate(first.getDate() - startDow);

    const last = new Date(monthEnd);
    const endDow = last.getDay();
    const end = new Date(last);
    end.setDate(last.getDate() + (6 - endDow));

    const days: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
    const cur = new Date(start);
    while (cur <= end) {
      const iso = toISODate(cur);
      days.push({ date: new Date(cur), iso, inMonth: cur.getMonth() === monthStart.getMonth() });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [monthStart, monthEnd]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-semibold">Calendário de Vencimentos</div>
        <div className="text-xs text-slate-400">Visualize todos os vencimentos dos seus empréstimos</div>
      </div>

      {/* Top summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/25 bg-slate-950/35 shadow-glow backdrop-blur-md p-4">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-slate-900/60">🕒</span>
            A Vencer
          </div>
          <div className="mt-1 text-2xl font-semibold">{loading ? "–" : aVencerCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-slate-950/35 shadow-glow backdrop-blur-md p-4">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/20 bg-slate-900/60">⚠️</span>
            Vencidos
          </div>
          <div className="mt-1 text-2xl font-semibold">{loading ? "–" : vencidosCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-slate-950/35 shadow-glow backdrop-blur-md p-4">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-slate-900/60">📅</span>
            Total no Mês
          </div>
          <div className="mt-1 text-2xl font-semibold">{loading ? "–" : brl(totalNoMes)}</div>
        </div>
      </div>

      {erro ? (
        <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-4 text-sm text-red-200">{erro}</div>
      ) : null}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-xl border border-emerald-500/25 bg-slate-950/35 shadow-glow backdrop-blur-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-slate-900/60">📆</span>
              <div className="font-semibold">{fmtMonthTitle(monthRef)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="h-8 w-8 rounded-lg border border-emerald-500/20 bg-slate-900/50 hover:bg-slate-900/70"
                onClick={() => setMonthRef((m) => addMonths(m, -1))}
                aria-label="Mês anterior"
              >
                ‹
              </button>
              <button
                className="h-8 px-3 rounded-lg border border-emerald-500/20 bg-slate-900/50 hover:bg-slate-900/70 text-xs"
                onClick={() => {
                  const now = new Date();
                  setMonthRef(startOfMonth(now));
                  setSelectedISO(toISODate(now));
                }}
              >
                Hoje
              </button>
              <button
                className="h-8 w-8 rounded-lg border border-emerald-500/20 bg-slate-900/50 hover:bg-slate-900/70"
                onClick={() => setMonthRef((m) => addMonths(m, 1))}
                aria-label="Próximo mês"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-3 text-xs text-slate-400">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((x) => (
              <div key={x} className="text-center">
                {x}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-3">
            {gridDays.map(({ date, iso, inMonth }) => {
              const items = byDay.get(iso) ?? [];
              const isSelected = sameISO(iso, selectedISO);
              const isToday = sameISO(iso, todayISO);
              const hasOverdue = items.some((x) => x.parcela.vencimento < todayISO);
              return (
                <button
                  key={iso}
                  onClick={() => setSelectedISO(iso)}
                  className={
                    "relative aspect-[1.25] rounded-xl border bg-slate-950/20 shadow-sm transition " +
                    (inMonth ? "border-emerald-500/25 hover:border-emerald-400/40" : "border-slate-800/30 opacity-50") +
                    (isSelected ? " ring-2 ring-emerald-400/80" : "")
                  }
                >
                  <div className={"absolute left-3 top-3 text-sm font-semibold " + (isToday ? "text-emerald-300" : "text-slate-200")}>
                    {date.getDate()}
                  </div>

                  {/* dots */}
                  <div className="absolute bottom-3 left-3 flex items-center gap-1">
                    {items.length > 0 ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : null}
                    {hasOverdue ? <span className="h-2 w-2 rounded-full bg-red-500" /> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Empréstimo
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400" /> Veículo
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Produto
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Vencido
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="rounded-xl border border-emerald-500/25 bg-slate-950/35 shadow-glow backdrop-blur-md p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{selectedItems.length ? fmtDayTitle(selectedISO) : "Selecione uma data"}</div>
              <div className="text-xs text-slate-400">Clique em uma data para ver os vencimentos</div>
            </div>
            {selectedItems.length ? (
              <div className="text-[11px] px-2 py-1 rounded-full border border-emerald-500/20 bg-slate-900/60 text-emerald-200">
                {selectedItems.length} cobranças
              </div>
            ) : null}
          </div>

          {selectedItems.length ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-300">Total a cobrar no dia</div>
                  <div className="text-[11px] text-slate-400">{selectedItems.length} parcela(s) • {new Set(selectedItems.map((x) => x.emprestimo.id)).size} empréstimo(s)</div>
                </div>
                <div className="text-lg font-semibold text-emerald-300">{brl(selectedTotal)}</div>
              </div>

              {selectedItems
                .slice()
                .sort((a, b) => String(a.emprestimo.clienteNome).localeCompare(String(b.emprestimo.clienteNome)))
                .map(({ emprestimo, parcela }) => {
                  const atrasoDias = parcela.vencimento < todayISO ? Math.max(0, daysDiff(parcela.vencimento, todayISO)) : 0;
                  const soJuros = computeSoJurosPorParcela(emprestimo);
                  const isOverdue = atrasoDias > 0;
                  return (
                    <div
                      key={`${emprestimo.id}-${parcela.id}`}
                      className={
                        "rounded-xl border p-4 " +
                        (isOverdue ? "border-red-500/25 bg-red-950/15" : "border-emerald-500/20 bg-slate-950/25")
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={"inline-flex h-7 w-7 items-center justify-center rounded-full border " + (isOverdue ? "border-red-500/30 bg-red-950/30" : "border-emerald-500/30 bg-emerald-950/20")}>
                            {isOverdue ? "⚠" : "🕒"}
                          </span>
                          <div className="font-semibold text-sm">{emprestimo.clienteNome || "(Sem nome)"}</div>
                        </div>
                        <div className="text-[11px] px-2 py-1 rounded-full border border-emerald-500/15 bg-slate-900/60 text-slate-200">
                          {parcela.numero}/{Math.max(1, emprestimo.numeroParcelas)}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg border border-white/5 bg-slate-900/35 p-2">
                          <div className="text-[11px] text-slate-400">Parcela:</div>
                          <div className="font-semibold">{brl(Number(parcela.valor ?? 0))}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-slate-900/35 p-2">
                          <div className="text-[11px] text-slate-400">Só Juros:</div>
                          <div className="font-semibold text-purple-300">{brl(soJuros)}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-slate-900/35 p-2">
                          <div className="text-[11px] text-slate-400">Emprestado:</div>
                          <div className="font-semibold">{brl(Number(emprestimo.valor ?? 0))}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-slate-900/35 p-2">
                          <div className="text-[11px] text-slate-400">Total a Receber:</div>
                          <div className="font-semibold text-emerald-300">{brl(Number(emprestimo.totalReceber ?? 0))}</div>
                        </div>
                      </div>

                      {isOverdue ? (
                        <div className="mt-2 text-[11px] text-red-200">Em atraso: {atrasoDias} dia(s)</div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="mt-10 flex flex-col items-center justify-center text-slate-500">
              <div className="text-4xl">🗓️</div>
              <div className="mt-3 text-sm">Clique em uma data para ver os vencimentos</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
