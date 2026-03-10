import DashboardHeader from "../components/dashboard/DashboardHeader";
import InstallBanner from "../components/dashboard/InstallBanner";
import WeekSummary from "../components/dashboard/WeekSummary";
import ChartsSection from "../components/dashboard/ChartsSection";
import OperationHealth from "../components/dashboard/OperationHealth";
import ScoreHighlights from "../components/dashboard/ScoreHighlights";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePermissoes } from "../store/usePermissoes";
import { useAuthStore } from "../store/useAuthStore";
import { supabase } from "../lib/supabaseClient";
import {
  commissionFactorFromPct,
  formatBrlValue,
  getStaffCommissionPct,
  parseBrlValue,
  scaleByCommission,
  scaleCurrencyDisplay,
} from "../lib/staffCommission";
import {
  getDashboardData,
  invalidateDashboardCache,
  peekDashboardCache,
  type DashboardData,
  type DashboardRange,
  getDashboardMetrics,
} from "../services/dashboard.service";
import { getMyStaffWallet } from "../services/staffWallet.service";

export default function Dashboard() {
  const navigate = useNavigate();
  const refreshTimer = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState<DashboardRange>("6m");

  const { isOwner } = usePermissoes();
  const user = useAuthStore((s) => s.user);

  const [staffCommissionPct, setStaffCommissionPct] = useState<number>(0);
  const [staffLucroRealizado, setStaffLucroRealizado] = useState<number>(0);
  const [staffCommissionValue, setStaffCommissionValue] = useState<number>(0);
  const [staffPaidOutValue, setStaffPaidOutValue] = useState<number>(0);
  const [lucro30d, setLucro30d] = useState<number>(0);

  // Pesquisa rápida (clientes) — ajuda a navegar sem sair do Dashboard
  const [q, setQ] = useState("");
  const [qOpen, setQOpen] = useState(false);
  const [qLoading, setQLoading] = useState(false);
  const [qResults, setQResults] = useState<{ id: string; nome: string; cpf?: string; telefone?: string }[]>([]);


  const rangeLabel = useMemo(() => {
    if (range === "30d") return "30 dias";
    if (range === "12m") return "12 meses";
    return "6 meses";
  }, [range]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setQResults([]);
      setQOpen(false);
      return;
    }
    setQOpen(true);

    const t = window.setTimeout(async () => {
      try {
        setQLoading(true);
        const like = `%${term}%`;
        let query = supabase
          .from("clientes")
          .select("id, nome, cpf, telefone, payload")
          .limit(120);
        if (user?.id) {
          query = query.or(`created_by.eq.${user.id},and(created_by.is.null,user_id.eq.${user.id})`);
        }
        const { data, error } = await query;

        if (error) throw error;

        const rows = (data ?? []) as any[];
        const normalized = rows
          .filter((r) => {
            const p = (r.payload ?? {}) as any;
            const nome = String(p.nomeCompleto ?? r.nome ?? "").toLowerCase();
            const cpf = String(p.cpf ?? r.cpf ?? "").toLowerCase();
            const tel = String(p.telefone ?? r.telefone ?? "").toLowerCase();
            const t = term.toLowerCase();
            return nome.includes(t) || cpf.includes(t) || tel.includes(t);
          })
          .slice(0, 8)
          .map((r) => {
          const p = (r.payload ?? {}) as any;
          return {
            id: String(r.id),
            nome: String(p.nomeCompleto ?? r.nome ?? "").trim() || "Sem nome",
            cpf: String(p.cpf ?? r.cpf ?? "").trim(),
            telefone: String(p.telefone ?? r.telefone ?? "").trim(),
          };
        });

        setQResults(normalized);
      } catch {
        setQResults([]);
      } finally {
        setQLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [q, user?.id]);


  const load = async (opts?: { force?: boolean }) => {
    try {
      const force = Boolean(opts?.force);

      // Show cached data instantly (streaming/progressive UI)
      if (!force) {
        const cached = peekDashboardCache(range);
        if (cached) setData(cached);
      }

      // Only show spinner if we have nothing to show yet
      const hasSomething = Boolean(data) || Boolean(peekDashboardCache(range));
      if (!hasSomething || force) setLoading(true);
      setError(null);
      const [d, metrics] = await Promise.all([
        getDashboardData(range, { force }),
        getDashboardMetrics().catch(() => ({ lucro_30d: 0 })),
      ]);
      setData(d);
      setLucro30d(Number(metrics?.lucro_30d ?? 0));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Falha ao carregar dados do dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // First paint: cached (if any) + revalidate in background
    load();
    // Revalidate after paint for freshest metrics
    const t = window.setTimeout(() => load({ force: true }), 0);
    return () => window.clearTimeout(t);
  }, [range]);

  useEffect(() => {
    let active = true;

    const debouncedRefresh = () => {
      if (!active) return;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        if (!active) return;
        // Invalidate + fetch fresh (debounced) to keep the UI consistent
        invalidateDashboardCache(range);
        load({ force: true });
      }, 350);
    };

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "parcelas" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "emprestimos" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, debouncedRefresh)
      .subscribe();

    return () => {
      active = false;
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [range]);
  

  

// Card de comissão (apenas para funcionários)
useEffect(() => {
  let alive = true;
  (async () => {
    try {
      if (isOwner) return;
      if (!user?.id) return;

      try {
        const wallet = await getMyStaffWallet();
        if (wallet) {
          if (!alive) return;
          setStaffCommissionPct(wallet.commission_pct);
          setStaffLucroRealizado(wallet.realized_profit);
          setStaffCommissionValue(Math.max(0, wallet.available_balance));
          setStaffPaidOutValue(Math.max(0, wallet.paid_total));
          return;
        }
      } catch (walletError) {
        console.warn("Falha ao carregar carteira própria do staff, usando fallback local:", walletError);
      }

      // fallback local enquanto a migration nova não for aplicada
      const pct = await getStaffCommissionPct(user.id);
      if (!alive) return;
      setStaffCommissionPct(pct);

      // fallback: calcula comissão bruta sem saldo de repasse
      const { data: loans, error: loansErr } = await supabase
        .from("emprestimos")
        .select("id,payload,created_by")
        .eq("created_by", user.id);

      if (loansErr) throw loansErr;

      const { data: pays, error: paysErr } = await supabase
        .from("parcelas")
        .select("emprestimo_id,valor,valor_pago_acumulado,juros_atraso,pago")
        .eq("pago", true)
        .in("emprestimo_id", ((loans ?? []) as any[]).map((l) => String(l.id)));

      if (paysErr) throw paysErr;

      const receivedByLoan = new Map<string, number>();
      for (const p of (pays ?? []) as any[]) {
        const id = String(p.emprestimo_id ?? "");
        const val = Number(p.valor_pago_acumulado ?? p.valor ?? 0) + Number(p.juros_atraso ?? 0);
        receivedByLoan.set(id, (receivedByLoan.get(id) ?? 0) + (Number.isFinite(val) ? val : 0));
      }

      let lucroReal = 0;
      for (const l of (loans ?? []) as any[]) {
        const principal = Number(l?.payload?.valor ?? 0);
        const rec = receivedByLoan.get(String(l.id)) ?? 0;
        lucroReal += Math.max(0, rec - principal);
      }

      if (!alive) return;
      setStaffLucroRealizado(lucroReal);
      setStaffCommissionValue(Math.max(0, scaleByCommission(lucroReal, commissionFactorFromPct(pct))));
      setStaffPaidOutValue(0);
    } catch (e) {
      console.error(e);
    }
  })();
  return () => {
    alive = false;
  };
}, [isOwner, user?.id]);

const header = data?.header ?? {
    title: "Bem-vindo de volta!",
    subtitle: "Gerencie seu sistema financeiro",
    roleLabel: "Dono (acesso total)",
  };

  const staffCommissionFactor = useMemo(() => {
    if (isOwner) return 1;
    return commissionFactorFromPct(staffCommissionPct);
  }, [isOwner, staffCommissionPct]);

  const fallbackWeekCards = [
    { label: "Cobranças", value: "—", hint: "esta semana" },
    { label: "Recebido no mês", value: "—", hint: "total registrado no mês" },
    { label: "Vence hoje", value: "—", hint: "cobranças" },
    { label: "Empréstimos", value: "—", hint: "esta semana" },
    { label: "Produtos", value: 0, hint: "esta semana" },
    { label: "Previsão de Lucro", value: "—", hint: "valor a receber - capital" },
    { label: "Contratos", value: "—", hint: "total" },
    { label: "Juros a receber", value: "—", hint: "últimos 6 meses" },
    { label: "Lucro (30 dias)", value: "—", hint: "lucro últimos 30 dias" },
    { label: "Capital na Rua", value: "—", hint: "capital emprestado" },
    { label: "Juros recebidos", value: "—", hint: "total" },
    { label: "Clientes", value: "—", hint: "cadastrados" },
  ];

  const weekCards = useMemo(() => {
    const cards = data?.weekCards ?? fallbackWeekCards;
    return cards.map((c) => {
      const lbl = c.label.toLowerCase();
      const scaledValue =
        isOwner || typeof c.value === "number" ? c.value : scaleCurrencyDisplay(c.value, staffCommissionFactor);
      if (lbl.includes("lucro") && (lbl.includes("mês") || lbl.includes("mes"))) {
        return {
          ...c,
          label: "Lucro (30 dias)",
          value: formatBrlValue(scaleByCommission(Number(lucro30d), staffCommissionFactor)),
          hint: "lucro últimos 30 dias",
        };
      }
      return { ...c, value: scaledValue };
    });
  }, [data?.weekCards, isOwner, lucro30d, staffCommissionFactor]);

  const atrasoValor = useMemo(() => {
    const card = weekCards.find((c) => c.label === "Em atraso");
    if (!card) return 0;
    if (typeof card.value === "number") return card.value;
    return parseBrlValue(card.value);
  }, [weekCards]);

  const lucroMensal = useMemo(() => {
    return (data?.charts?.evolucao?.data ?? []).map((r: any) => ({
      mes_ref: String(r.label ?? ""),
      lucro_mes: scaleByCommission(Number(r.lucro ?? 0), staffCommissionFactor),
    }));
  }, [data?.charts?.evolucao?.data, staffCommissionFactor]);

  const health = useMemo(() => {
    const base = data?.health ?? {
      score: 0,
      status: "—",
      desc: "Carregando métricas…",
      bars: [
        { label: "Taxa de recebimento", value: "—" },
        { label: "Inadimplência", value: "—" },
        { label: "Recebido", value: "—" },
        { label: "Em atraso", value: "—" },
      ],
      noteTitle: "—",
      noteDesc: "—",
    };

    if (isOwner) return base;

    return {
      ...base,
      bars: (base.bars ?? []).map((bar) => ({
        ...bar,
        value: String(scaleCurrencyDisplay(bar.value, staffCommissionFactor)),
      })),
    };
  }, [data?.health, isOwner, staffCommissionFactor]);

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2">
      <DashboardHeader
        title={header.title}
        subtitle={header.subtitle}
        roleLabel={header.roleLabel}
      />


{!isOwner ? (
  <div className="mx-auto mt-4 w-full max-w-full sm:max-w-4xl px-0 sm:px-2">
    <div className="rounded-2xl border border-emerald-500/15 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-100">Sua comissão</div>
          <div className="mt-1 text-xs text-slate-400">
            Percentual configurado: <span className="text-slate-200">{staffCommissionPct.toFixed(1)}%</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Lucro realizado no sistema: <span className="text-slate-200">{staffLucroRealizado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Já repassado: <span className="text-slate-200">{staffPaidOutValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Valores financeiros do painel já consideram esse percentual.
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Saldo atual de repasse</div>
          <div className="mt-1 text-xl font-bold text-emerald-200">
            {staffCommissionValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Cálculo: carteira do staff - repasses já feitos</div>
        </div>
      </div>
    </div>
  </div>
) : null}

      {/* Pesquisa rápida */}
      <div className="relative mx-auto mt-4 w-full max-w-xl sm:max-w-2xl lg:max-w-full sm:max-w-3xl px-0 sm:px-2">
        <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 h-10">
          <span className="text-white/40">🔎</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => q.trim() && setQOpen(true)}
            placeholder="Buscar cliente por nome, telefone ou CPF..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
          {qLoading ? <span className="text-xs text-white/40">...</span> : null}
        </div>

        {qOpen ? (
          <div className="absolute left-4 right-4 top-[46px] z-20 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/95 backdrop-blur shadow-xl">
            {qResults.length === 0 ? (
              <div className="px-4 py-3 text-sm text-white/50">Nenhum cliente encontrado.</div>
            ) : (
              <div className="max-h-72 overflow-auto">
                {qResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setQOpen(false);
                      setQ('');
                      navigate(`/clientes/${r.id}`);
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-700/60 px-0 sm:px-2 py-3 text-left hover:bg-slate-800/50"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">{r.nome}</div>
                      <div className="text-xs text-white/50">
                        {(r.telefone || "").slice(0, 30)}{r.telefone ? " • " : ""}{(r.cpf || "").slice(0, 30)}
                      </div>
                    </div>
                    <span className="text-xs text-emerald-300">Abrir</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-2 text-xs text-white/40">
              <span>Enter para abrir o primeiro resultado</span>
              <button className="hover:text-white/70" onClick={() => setQOpen(false)}>Fechar</button>
            </div>
          </div>
        ) : null}
      </div>


      <div className="mt-4">
        <InstallBanner
          title="Instale o Raposacobra no seu celular"
          desc="Tenha acesso rápido direto do seu celular. Indicado p/ offline e como um app nativo!"
          button="Ver instruções"
          onClick={() => alert("Abrir instruções de instalação (mock)")}
        />
      </div>

      {atrasoValor > 0 ? (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 shadow-[0_10px_28px_rgba(239,68,68,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-red-100">Atenção: existem parcelas em atraso</div>
              <div className="text-sm text-red-100/70">
                Clique para abrir a lista e cobrar/pagar agora.
              </div>
            </div>

            <button className="rc-btn-primary" onClick={() => navigate("/parcelas/atrasadas")}>
              Ver atrasos
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 text-sm text-white/60">Carregando painel…</div>
      ) : null}

      <div className="mt-4">
        <WeekSummary cards={weekCards} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-white/70">Período: <span className="font-semibold text-white/90">{rangeLabel}</span></div>
        <div className="flex gap-2">
          <button
            type="button"
            className={range === "30d" ? "rc-btn-primary" : "rc-btn-outline"}
            onClick={() => setRange("30d")}
          >
            30 dias
          </button>
          <button
            type="button"
            className={range === "6m" ? "rc-btn-primary" : "rc-btn-outline"}
            onClick={() => setRange("6m")}
          >
            6 meses
          </button>
          <button
            type="button"
            className={range === "12m" ? "rc-btn-primary" : "rc-btn-outline"}
            onClick={() => setRange("12m")}
          >
            12 meses
          </button>
        </div>
      </div>

      <div className="mt-4">
        <ChartsSection data={lucroMensal} />
      </div>

      <div className="mt-4">
        <ScoreHighlights />
      </div>

      <div className="mt-4">
        <OperationHealth {...health} />
        {false ? (
        <OperationHealth
          {...(data?.health ?? {
            score: 0,
            status: "—",
            desc: "Carregando métricas…",
            bars: [
              { label: "Taxa de recebimento", value: "—" },
              { label: "Inadimplência", value: "—" },
              { label: "Recebido", value: "—" },
              { label: "Em atraso", value: "—" },
            ],
            noteTitle: "—",
            noteDesc: "—",
          })}
        />
        ) : null}
      </div>
    </div>
  );
}
