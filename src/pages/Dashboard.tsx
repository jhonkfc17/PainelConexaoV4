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
  getDashboardData,
  invalidateDashboardCache,
  peekDashboardCache,
  type DashboardData,
  type DashboardRange,
} from "../services/dashboard.service";

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
        const { data, error } = await supabase
          .from("clientes")
          .select("id, nome, cpf, telefone, payload")
          .or(`nome.ilike.${like},cpf.ilike.${like},telefone.ilike.${like}`)
          .limit(8);

        if (error) throw error;

        const rows = (data ?? []) as any[];
        const normalized = rows.map((r) => {
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
  }, [q]);


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
      const d = await getDashboardData(range, { force });
      setData(d);
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

      // 1) Pega % de comissão do funcionário
      const { data: staffRow } = await supabase
        .from("staff_members")
        .select("commission_pct")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const pct = Number((staffRow as any)?.commission_pct ?? 0);
      if (!alive) return;
      setStaffCommissionPct(pct);

      // 2) Calcula lucro realizado (juros recebidos) e comissão
      const { data: loans, error: loansErr } = await supabase
        .from("emprestimos")
        .select("id,payload,created_by")
        .eq("created_by", user.id);

      if (loansErr) throw loansErr;

      const { data: pays, error: paysErr } = await supabase
        .from("parcelas")
        .select("emprestimo_id,valor,valor_pago_acumulado,valor_pago,juros_atraso,pago")
        .eq("pago", true)
        .in("emprestimo_id", ((loans ?? []) as any[]).map((l) => String(l.id)));

      if (paysErr) throw paysErr;

      function safeNum(v: any) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }
      function jurosPrevistoPorParcela(payload: any) {
        const principal = safeNum(payload?.valor);
        const totalReceber = safeNum(payload?.totalReceber ?? payload?.total_receber ?? payload?.total_receber_calc);
        const n = Math.max(1, Math.floor(safeNum(payload?.parcelas ?? payload?.numeroParcelas ?? payload?.numero_parcelas)));
        return Math.max(0, totalReceber - principal) / n;
      }
      function jurosRecebidosParcela(p: any, payload: any) {
        const valorParcela = safeNum(p.valor);
        const valorPago = safeNum(p.valor_pago_acumulado ?? p.valor_pago ?? 0);
        const fracao = valorParcela > 0 ? Math.max(0, Math.min(1, valorPago / valorParcela)) : 0;
        const base = jurosPrevistoPorParcela(payload) * fracao;
        const jurosAtraso = safeNum(p.juros_atraso);
        const excedente = Math.max(0, valorPago - valorParcela);
        const extra = Math.max(jurosAtraso, excedente);
        return Math.max(0, base + extra);
      }

      const payloadByLoan = new Map<string, any>();
      for (const l of (loans ?? []) as any[]) payloadByLoan.set(String(l.id), l.payload ?? {});

      const jurosByLoan = new Map<string, number>();
      for (const p of (pays ?? []) as any[]) {
        const id = String(p.emprestimo_id ?? "");
        const payload = payloadByLoan.get(id) ?? {};
        jurosByLoan.set(id, (jurosByLoan.get(id) ?? 0) + jurosRecebidosParcela(p, payload));
      }

      // Inclui pagamentos manuais de juros (fluxo "Pagar Juros")
      const { data: manualPays } = await supabase
        .from("pagamentos")
        .select("emprestimo_id,valor,juros_atraso,estornado_em,tipo,flags")
        .is("estornado_em", null)
        .in("emprestimo_id", ((loans ?? []) as any[]).map((l) => String(l.id)));

      let jurosManuais = 0;
      for (const mp of (manualPays ?? []) as any[]) {
        const tipo = String(mp?.tipo ?? "").toUpperCase();
        const flags = (() => {
          try {
            const f = mp?.flags;
            if (!f) return null;
            if (typeof f === "string") return JSON.parse(f);
            return f;
          } catch {
            return null;
          }
        })();
        const contabilizar = Boolean((flags as any)?.contabilizar_como_lucro);
        const isJurosTipo = tipo.includes("JUROS");
        if (!contabilizar && !isJurosTipo) continue;
        jurosManuais += safeNum(mp.valor) + safeNum(mp.juros_atraso);
      }

      let lucroReal = jurosManuais;
      for (const l of (loans ?? []) as any[]) {
        lucroReal += jurosByLoan.get(String(l.id)) ?? 0;
      }

      if (!alive) return;
      setStaffLucroRealizado(lucroReal);
      setStaffCommissionValue(Math.max(0, lucroReal * (pct / 100)));
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

  const parseBRL = (v: unknown) => {
    const s = String(v ?? "");
    // Extrai número de "R$ 1.234,56" -> 1234.56
    const cleaned = s.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const atrasoValor = useMemo(() => {
    const card = (data?.weekCards ?? []).find((c) => c.label === "Em atraso");
    if (!card) return 0;
    // Pode ser número (count) ou string (R$)
    if (typeof card.value === "number") return card.value;
    return parseBRL(card.value);
  }, [data]);

  const fallbackWeekCards = [
    { label: "Cobranças", value: "—", hint: "esta semana" },
    { label: "Recebido no mês", value: "—", hint: "total registrado no mês" },
    { label: "Vence hoje", value: "—", hint: "cobranças" },
    { label: "Empréstimos", value: "—", hint: "esta semana" },
    { label: "Produtos", value: 0, hint: "esta semana" },
    { label: "Previsão de Lucro", value: "—", hint: "valor a receber - capital" },
    { label: "Contratos", value: "—", hint: "total" },
    { label: "Juros a receber", value: "—", hint: "últimos 6 meses" },
    { label: "Lucro no mês", value: "—", hint: "lucro (mês atual)" },
    { label: "Capital na Rua", value: "—", hint: "capital emprestado" },
    { label: "Juros recebidos", value: "—", hint: "total" },
    { label: "Clientes", value: "—", hint: "cadastrados" },
  ];

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
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Comissão estimada</div>
          <div className="mt-1 text-xl font-bold text-emerald-200">
            {staffCommissionValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Cálculo: lucro realizado × %</div>
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
        <WeekSummary cards={data?.weekCards ?? fallbackWeekCards} />
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
        <ChartsSection
          evolucao={
            data?.charts.evolucao ?? {
              title: "Evolução Financeira",
              data: [],
              keys: ["emprestado", "recebido"],
            }
          }
          juros={
            data?.charts.juros ?? {
              title: "Juros Recebidos",
              data: [],
              keys: ["juros"],
            }
          }
          inadimplencia={
            data?.charts.inadimplencia ?? {
              title: "Inadimplência",
              data: [],
              keys: ["inadimplencia"],
            }
          }
          aVencer={
            data?.charts.aVencer ?? {
              title: "Parcelas a vencer",
              data: [],
              keys: ["aVencer"],
            }
          }
        />
      </div>

      <div className="mt-4">
        <ScoreHighlights />
      </div>

      <div className="mt-4">
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
      </div>
    </div>
  );
}
