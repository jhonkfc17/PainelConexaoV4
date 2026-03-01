import { supabase } from "../lib/supabaseClient";
import { isOwnerUser } from "../lib/tenant";

export type DashboardRange = "30d" | "6m" | "12m";

export type DashboardWeekCard = { label: string; value: string | number; hint: string };

export type DashboardHealth = {
  score: number;
  status: string;
  desc: string;
  bars: { label: string; value: string }[];
  noteTitle: string;
  noteDesc: string;
};

export type DashboardSeriesPoint = { label: string; [key: string]: number | string };

export type DashboardData = {
  header: {
    title: string;
    subtitle: string;
    roleLabel: string;
  };
  weekCards: DashboardWeekCard[];
  charts: {
    evolucao: { title: string; data: DashboardSeriesPoint[]; keys: ["emprestado", "recebido"] };
    juros: { title: string; data: DashboardSeriesPoint[]; keys: ["juros"] };
    inadimplencia: { title: string; data: DashboardSeriesPoint[]; keys: ["inadimplencia"] };
    aVencer: { title: string; data: DashboardSeriesPoint[]; keys: ["aVencer"] };
  };
  health: DashboardHealth;
};

export type DashboardMetricsViewRow = {
  total_recebido_mes: number | null;
  lucro_mes: number | null;
  juros_embutido_mes?: number | null;
  juros_atraso_mes?: number | null;
  multa_mes?: number | null;
  parcelas_pagas_mes?: number | null;
  em_atraso_valor?: number | null;
  em_atraso_qtd?: number | null;
};

export type DashboardMetrics30dViewRow = {
  total_recebido_30d: number | null;
  lucro_30d: number | null;
  juros_embutido_30d?: number | null;
  juros_atraso_30d?: number | null;
  multa_30d?: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Ultra-perf: in-memory cache (SWR) + inflight de-duplication
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 25_000;

type CacheEntry = {
  value: DashboardData;
  expiresAt: number;
};

const cacheByRange = new Map<DashboardRange, CacheEntry>();
const inflightByRange = new Map<DashboardRange, Promise<DashboardData>>();

export function invalidateDashboardCache(range?: DashboardRange) {
  if (range) {
    cacheByRange.delete(range);
    inflightByRange.delete(range);
    return;
  }
  cacheByRange.clear();
  inflightByRange.clear();
}

export function peekDashboardCache(range: DashboardRange): DashboardData | null {
  const cached = cacheByRange.get(range);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) return null;
  return cached.value;
}

type ParcelaRow = {
  emprestimo_id?: string;
  vencimento: string; // YYYY-MM-DD
  valor: number | null;
  pago: boolean | null;
  pago_em: string | null; // ISO
  valor_pago: number | null;
  // alguns bancos usam amortização parcial
  valor_pago_acumulado?: number | null;
  juros_atraso: number | null;
};

type EmprestimoRow = {
  id: string;
  created_at: string;
  payload: any;
  principal?: number | null;
  total_receber?: number | null;
  numero_parcelas?: number | null;
  taxa_mensal?: number | null;
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function safeNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function valorPagoAcumulado(p: ParcelaRow): number {
  // valor_pago_acumulado (quando presente) representa o histórico consolidado.
  // valor_pago é o campo padrão de pagamento único; use-o como fallback.
  // Se nenhum deles vier preenchido, assuma 0.
  const bruto = p.valor_pago_acumulado ?? p.valor_pago ?? 0;
  return safeNum(bruto);
}

function valorRecebidoTotal(p: ParcelaRow): number {
  // Total efetivamente recebido: principal pago (ou valor da parcela) + juros de atraso (quando registrado separado).
  const principal = valorPagoAcumulado(p) || safeNum(p.valor);
  const juros = safeNum(p.juros_atraso);
  return principal + juros;
}

function paidDateOrToday(p: ParcelaRow, todayISO: string): string | null {
  const valorPago = valorPagoAcumulado(p);
  const pagoFlag = Boolean(p.pago);
  if (!pagoFlag && !(valorPago > 0)) return null;
  return p.pago_em ? isoFromAny(p.pago_em) : todayISO;
}

function toDateOnlyISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  // semana começando na segunda (pt-BR)
  const day = (x.getDay() + 6) % 7; // 0=segunda
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

function addMonths(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  return x;
}

function monthKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function monthLabelPtBr(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map((s) => Number(s));
  const d = new Date(y, (m || 1) - 1, 1);
  const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const yy = String(y).slice(-2);
  return `${mes[0].toUpperCase()}${mes.slice(1)}/${yy}`;
}

function dayLabelPtBr(isoDate: string): string {
  // YYYY-MM-DD -> DD/MM
  const [y, m, d] = isoDate.split("-").map((s) => Number(s));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function isoFromAny(iso: string): string {
  // "2026-02-12" or "2026-02-12T..." -> date only
  return String(iso).slice(0, 10);
}

function jurosPrevistoPorParcela(e: EmprestimoRow): number {
  // Preferimos colunas normalizadas (nova estrutura).
  const principalCol = safeNum((e as any).principal);
  const totalReceberCol = safeNum((e as any).total_receber);
  const nCol = Math.max(1, Math.floor(safeNum((e as any).numero_parcelas)));

  if (principalCol > 0 && totalReceberCol > 0 && nCol > 0) {
    const jurosPrevisto = Math.max(0, totalReceberCol - principalCol);
    return jurosPrevisto / nCol;
  }

  // Fallback: contratos antigos (quando ainda estava tudo no payload jsonb)
  const payload = (e.payload ?? {}) as any;
  const principal = safeNum(payload.valor ?? payload.principal ?? payload.capital ?? payload.valor_emprestado ?? payload.valorEmprestado);
  const totalReceber = safeNum(
    payload.totalReceber ??
      payload.total_receber ??
      payload.total_receber_calc ??
      payload.total_receber_previsto ??
      payload.valor_total ??
      payload.valorTotal ??
      payload.total
  );
  const n = Math.max(1, Math.floor(safeNum(payload.parcelas ?? payload.numeroParcelas ?? payload.numero_parcelas ?? payload.qtd_parcelas ?? payload.parcelas_total)));
  const jurosPrevisto = Math.max(0, totalReceber - principal);
  return jurosPrevisto / n;
}


function parcelaJurosRecebido(p: ParcelaRow, e?: EmprestimoRow): number {
  // Lucro = juros recebidos (independe de recuperar capital).
  // Heurística usada no app:
  // 1) Juros base (embutido) por parcela = (totalReceber - principal) / nParcelas
  // 2) Proporcional ao quanto foi pago (em pagamentos parciais)
  // 3) Soma juros de atraso (explicitamente registrado) ou excedente acima do valor da parcela

  const valorParcela = safeNum(p.valor);
  const valorPago = valorPagoAcumulado(p);
  const fracaoPaga = valorParcela > 0 ? Math.max(0, Math.min(1, valorPago / valorParcela)) : 0;

  const jurosBase = e ? jurosPrevistoPorParcela(e) * fracaoPaga : 0;

  const jurosAtraso = safeNum(p.juros_atraso);
  const excedente = Math.max(0, valorPago - valorParcela);
  const jurosExtra = Math.max(jurosAtraso, excedente);

  return Math.max(0, jurosBase + jurosExtra);
}

type Bucket = {
  key: string; // machine key (YYYY-MM or YYYY-MM-DD)
  label: string; // display
  start: string; // date only ISO inclusive
  end: string; // date only ISO inclusive
};

function makeBuckets(now: Date, range: DashboardRange): { buckets: Bucket[]; startISO: string } {
  if (range === "30d") {
    const start = toDateOnlyISO(addDays(now, -29));
    const buckets: Bucket[] = [];
    for (let i = 0; i < 30; i += 1) {
      const d = addDays(new Date(start), i);
      const iso = toDateOnlyISO(d);
      buckets.push({ key: iso, label: dayLabelPtBr(iso), start: iso, end: iso });
    }
    return { buckets, startISO: start };
  }

  const monthsBack = range === "6m" ? 5 : 11; // inclui mês atual
  const months: string[] = [];
  for (let i = monthsBack; i >= 0; i -= 1) {
    months.push(monthKey(addMonths(now, -i)));
  }
  const startISO = `${months[0]}-01`;

  const buckets: Bucket[] = months.map((k) => {
    const [y, m] = k.split("-").map((s) => Number(s));
    const first = new Date(y, (m || 1) - 1, 1);
    const last = new Date(y, (m || 1), 0); // last day of month
    return {
      key: k,
      label: monthLabelPtBr(k),
      start: toDateOnlyISO(first),
      end: toDateOnlyISO(last),
    };
  });

  return { buckets, startISO };
}

function isPaidByDate(p: ParcelaRow, dateISO: string): boolean {
  const valorPago = valorPagoAcumulado(p);
  const marcadoPago = Boolean(p.pago);
  const paidDate = p.pago_em ? isoFromAny(p.pago_em) : null;

  // Considera parcela paga se valor_pago_acumulado > 0 mesmo que flag pago esteja falsa
  if (!marcadoPago && !(valorPago > 0)) return false;

  // Se não há data registrada, assume pago na data avaliada (conta como recebido até hoje)
  if (!paidDate) return true;

  return paidDate <= dateISO;
}

function buildEmptyDashboard(range: DashboardRange): DashboardData {
  const title = range === "30d" ? "Últimos 30 dias" : range === "6m" ? "Últimos 6 meses" : "Últimos 12 meses";
  const emptySeries = Array.from({ length: range === "30d" ? 6 : range === "6m" ? 6 : 12 }).map((_, i) => ({
    label: String(i + 1),
    emprestado: 0,
    recebido: 0,
    juros: 0,
    inadimplencia: 0,
    aVencer: 0,
  })) as any;

  return {
    header: { title: "Dashboard", subtitle: title, roleLabel: "" },
    weekCards: [
      { label: "Emprestado", value: "R$ 0,00", hint: "0 contratos" },
      { label: "Recebido no mês", value: "R$ 0,00", hint: "0 parcelas pagas" },
      { label: "Lucro no mês", value: "R$ 0,00", hint: "lucro realizado (mês atual)" },
    ],
    charts: {
      evolucao: { title: "Evolução", data: emptySeries, keys: ["emprestado", "recebido"] },
      juros: { title: "Juros", data: emptySeries, keys: ["juros"] },
      inadimplencia: { title: "Inadimplência", data: emptySeries, keys: ["inadimplencia"] },
      aVencer: { title: "A vencer", data: emptySeries, keys: ["aVencer"] },
    },
    health: {
      score: 0,
      status: "Neutro",
      desc: "Sem dados suficientes no período.",
      bars: [
        { label: "Ativos", value: "0" },
        { label: "Pagos", value: "0" },
        { label: "Atraso", value: "0" },
      ],
      noteTitle: "Dica",
      noteDesc: "Cadastre empréstimos e baixas para ver indicadores.",
    },
  };
}

export async function getDashboardData(range: DashboardRange = "6m", opts?: { force?: boolean }): Promise<DashboardData> {
  const force = Boolean(opts?.force);

  // Fast path: serve fresh cache
  if (!force) {
    const cached = cacheByRange.get(range);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const inflight = inflightByRange.get(range);
    if (inflight) return inflight;

    // Start a single in-flight fetch (de-dupe), cache the result, and return it.
    const p = getDashboardData(range, { force: true });
    inflightByRange.set(range, p);

    try {
      const value = await p;
      cacheByRange.set(range, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    } finally {
      inflightByRange.delete(range);
    }
  }

  // =========================
  // Auth / Role
  // =========================
  const { data: authUserData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const user = authUserData.user;
  const email = user?.email || "";
  const isOwner = await isOwnerUser();

  const now = new Date();
  const todayISO = toDateOnlyISO(now);
  const tomorrowISO = toDateOnlyISO(addDays(now, 1));
  const weekStartISO = toDateOnlyISO(startOfWeek(now));
  const weekStartDate = new Date(`${weekStartISO}T00:00:00`);
  const weekEndDate = new Date(`${todayISO}T23:59:59`);
  const { buckets, startISO } = makeBuckets(now, range);

  // =========================
  // Base data (counts)
  // =========================
  const { count: clientesCount, error: clientesCountErr } = await supabase
    .from("clientes")
    .select("id", { count: "exact", head: true });
  if (clientesCountErr) throw clientesCountErr;

  // =========================
  // Pull emprestimos + parcelas for the selected window
  // =========================
  let empQuery = supabase
    .from("emprestimos")
    .select("id, created_at, payload, principal, total_receber, numero_parcelas, taxa_mensal")
    .gte("created_at", new Date(`${startISO}T00:00:00`).toISOString())
    .order("created_at", { ascending: true });

  // Staff: só os empréstimos que ele criou
  if (!isOwner && user?.id) {
    empQuery = empQuery.eq("created_by", user.id);
  }

  const { data: emprestimosData, error: empErr } = await empQuery;
  if (empErr) throw empErr;

  const emprestimos = (emprestimosData as EmprestimoRow[]) ?? [];

  // Parcelas: precisamos de um pouco antes do start para calcular inadimplência acumulada
  const backForArrears = range === "12m" ? 400 : range === "6m" ? 220 : 60;
  const parcelasFromISO = toDateOnlyISO(addDays(new Date(startISO), -backForArrears));

  let parcQuery = supabase
    .from("parcelas")
    .select("emprestimo_id, vencimento, valor, pago, pago_em, valor_pago_acumulado, juros_atraso")
    .gte("vencimento", parcelasFromISO)
    .order("vencimento", { ascending: true });

  // Staff: restringe parcelas aos empréstimos retornados (se ele não tem empréstimos, dashboard vazio)
  if (!isOwner && user?.id) {
    const ids = emprestimos.map((e) => String(e.id));
    if (ids.length === 0) return buildEmptyDashboard(range);
    parcQuery = parcQuery.in("emprestimo_id", ids);
  }

  const { data: parcelasData, error: parcErr } = await parcQuery;
  if (parcErr) throw parcErr;

  const parcelas = ((parcelasData as ParcelaRow[] | null) ?? []) as ParcelaRow[];

  // =========================
  // Week cards (semana atual)
  // =========================
  const emprestimosSemana = emprestimos.filter((e) => isoFromAny(e.created_at) >= weekStartISO).length;

  const capitalEmprestado = emprestimos.reduce((acc, e) => acc + safeNum(e.payload?.valor), 0);
  const totalReceberGeral = parcelas.reduce((acc, p) => acc + safeNum(p.valor), 0);
  const lucroPrevisto = Math.max(0, totalReceberGeral - capitalEmprestado);

  const venceHoje = parcelas.filter((p) => !p.pago && String(p.vencimento) === todayISO).length;
  const venceAmanha = parcelas.filter((p) => !p.pago && String(p.vencimento) === tomorrowISO).length;

  const cobrancasSemana = parcelas.filter(
    (p) => !p.pago && String(p.vencimento) >= weekStartISO && String(p.vencimento) <= todayISO
  ).length;

  // Pagamentos (com data resolvida)
  const pagosComData = parcelas
    .map((p) => ({ p, paidDate: paidDateOrToday(p, todayISO) }))
    .filter((r) => Boolean(r.paidDate)) as { p: ParcelaRow; paidDate: string }[];

  // Recebidos brutos (principal + juros + multa)
  const totalRecebidoBruto = pagosComData.reduce((acc, r) => acc + valorRecebidoTotal(r.p), 0);

  const totalRecebidoAntesSemana = pagosComData
    .filter((r) => String(r.paidDate) < weekStartISO)
    .reduce((acc, r) => acc + valorRecebidoTotal(r.p), 0);

  const totalRecebidoDuranteSemana = pagosComData
    .filter((r) => String(r.paidDate) >= weekStartISO && String(r.paidDate) <= todayISO)
    .reduce((acc, r) => acc + valorRecebidoTotal(r.p), 0);

  // Mês atual (calendário)
  const currentMonthKey = monthKey(now);
  const monthStartISO = toDateOnlyISO(new Date(now.getFullYear(), now.getMonth(), 1));

  // =========================
  // DB Views (preferível): métricas prontas (Lucro = juros recebidos)
  // =========================
  let metricsMes: DashboardMetricsViewRow | null = null;
  let metrics30d: DashboardMetrics30dViewRow | null = null;

  try {
    const { data } = await supabase.from('v_dashboard_metrics').select('*').maybeSingle();
    metricsMes = (data as any) ?? null;
  } catch {
    metricsMes = null;
  }
  try {
    const { data } = await supabase.from('v_dashboard_metrics_30d').select('*').maybeSingle();
    metrics30d = (data as any) ?? null;
  } catch {
    metrics30d = null;
  }

  try {
    const { data } = await supabase.from('v_dashboard_metrics_30d').select('*').maybeSingle();
    metrics30d = (data as any) ?? null;
  } catch {
    metrics30d = null;
  }

  const totalRecebidoAntesMes = pagosComData
    .filter((r) => String(r.paidDate) < monthStartISO)
    .reduce((acc, r) => acc + valorRecebidoTotal(r.p), 0);

  const totalRecebidoDuranteMes = pagosComData
    .filter((r) => String(r.paidDate) >= monthStartISO && String(r.paidDate) <= todayISO)
    .reduce((acc, r) => acc + valorRecebidoTotal(r.p), 0);

  const principalMes = pagosComData
    .filter((r) => String(r.paidDate) >= monthStartISO && String(r.paidDate) <= todayISO)
    .reduce((acc, r) => acc + safeNum(r.p.valor), 0);

  // Recebido no mês (até hoje) = principal + juros + multa de parcelas pagas
  const totalRecebidoMes = totalRecebidoDuranteMes;
  // Pagamentos registrados (inclusive juros-only) – capturados na tabela de pagamentos
  // para contemplar "Pagar Juros" e adiantamentos que não liquidam parcelas.
  let pagamentosMesValor = 0;
  let pagamentosMesJuros = 0;
  let pagamentosMesLucroFlags = 0;
  try {
    const pagamentosQuery = supabase
      .from("pagamentos")
      .select("valor, juros_atraso, data_pagamento, created_at, estornado_em, emprestimo_id, tipo, flags");

    const { data: pagamentosData } = await pagamentosQuery;
    const pagamentos = (pagamentosData ?? []) as any[];

    // Restringe a empréstimos visíveis quando não owner
    const emprestimoIdsSet = new Set(emprestimos.map((e) => String(e.id)));

    const pagamentosMes = pagamentos.filter((p) => {
      if (!isOwner && p.emprestimo_id && !emprestimoIdsSet.has(String(p.emprestimo_id))) return false;
      if (p.estornado_em) return false;
      const dataRef = isoFromAny(p.data_pagamento ?? p.created_at ?? null);
      if (!dataRef) return false;
      return monthKey(new Date(dataRef)) === currentMonthKey;
    });

    pagamentosMesValor = pagamentosMes.reduce(
      (acc, p) => acc + safeNum(p.valor) + safeNum((p as any).juros_atraso),
      0
    );
    pagamentosMesJuros = pagamentosMes.reduce((acc, p) => acc + safeNum((p as any).juros_atraso), 0);
    // Marcações explícitas de lucro (ex: "Pagar Juros")
    pagamentosMesLucroFlags = pagamentosMes.reduce((acc, p) => {
      const tipo = String((p as any).tipo ?? "").toUpperCase();
      const flags = (() => {
        try {
          const f = (p as any).flags;
          if (!f) return null;
          if (typeof f === "string") return JSON.parse(f);
          return f;
        } catch {
          return null;
        }
      })();
      const contabilizar = Boolean((flags as any)?.contabilizar_como_lucro);
      const isJurosTipo = tipo.includes("JUROS");
      const deveContarComoLucro = contabilizar || isJurosTipo;
      if (!deveContarComoLucro) return acc;
      return acc + safeNum(p.valor) + safeNum((p as any).juros_atraso);
    }, 0);
  } catch {
    // Em caso de falha, seguimos apenas com parcelas para não quebrar o dashboard.
    pagamentosMesValor = 0;
    pagamentosMesJuros = 0;
    pagamentosMesLucroFlags = 0;
  }

  const totalRecebidoMesView =
    range === "30d"
      ? safeNum((metrics30d as any)?.total_recebido_30d)
      : safeNum((metricsMes as any)?.total_recebido_mes);
  const totalRecebidoMesComPagamentos =
    (totalRecebidoMesView > 0 ? totalRecebidoMesView : totalRecebidoMes) + pagamentosMesValor;

  // Lucro (mês) = juros recebidos (independe de recuperar capital)
  const emprestimoById = new Map<string, EmprestimoRow>();
  for (const e of emprestimos) emprestimoById.set(String(e.id), e);

  const jurosRecebidosMesParcelas = parcelas
    .filter((p) => {
      const paidDate = paidDateOrToday(p, todayISO);
      if (!paidDate) return false;
      return monthKey(new Date(paidDate)) === currentMonthKey;
    })
    .reduce((acc, p) => {
      const e = emprestimoById.get(String(p.emprestimo_id ?? ""));
      return acc + parcelaJurosRecebido(p, e);
    }, 0);

  // pagamentosMesLucroFlags cobre o fluxo "Pagar Juros" (juros manuais)
  const lucroMesView =
    range === "30d" ? safeNum((metrics30d as any)?.lucro_30d) : safeNum((metricsMes as any)?.lucro_mes);
  const lucroMesCalc = Math.max(0, totalRecebidoMes - principalMes + pagamentosMesJuros + pagamentosMesLucroFlags);
  const lucroMes = lucroMesView > 0 ? lucroMesView : lucroMesCalc;

  // Lucro (semana/total) = juros recebidos (estimado)
  const jurosRecebidosSemana = parcelas
    .filter((p) => {
      const paidDate = paidDateOrToday(p, todayISO);
      if (!paidDate) return false;
      const dt = new Date(paidDate);
      return dt >= weekStartDate && dt <= weekEndDate;
    })
    .reduce((acc, p) => {
      const e = emprestimoById.get(String(p.emprestimo_id ?? ""));
      return acc + parcelaJurosRecebido(p, e);
    }, 0);

  const lucroSemana = jurosRecebidosSemana;

  const lucroRealizadoTotal = parcelas
    .filter((p) => {
      const paidDate = paidDateOrToday(p, todayISO);
      return Boolean(paidDate) && isPaidByDate(p, todayISO);
    })
    .reduce((acc, p) => {
      const e = emprestimoById.get(String(p.emprestimo_id ?? ""));
      return acc + parcelaJurosRecebido(p, e);
    }, 0);

  // =========================
  // Chart series
  // =========================
  const evolucaoData: DashboardSeriesPoint[] = buckets.map((b) => ({
    label: b.label,
    emprestado: 0,
    recebido: 0,
  }));

  const jurosData: DashboardSeriesPoint[] = buckets.map((b) => ({ label: b.label, juros: 0 }));

  const inadimplenciaData: DashboardSeriesPoint[] = buckets.map((b) => ({
    label: b.label,
    inadimplencia: 0,
  }));

  const aVencerData: DashboardSeriesPoint[] = buckets.map((b) => ({
    label: b.label,
    aVencer: 0,
  }));

  // Map bucket key -> idx
  const idxByKey = new Map<string, number>();
  for (let i = 0; i < buckets.length; i += 1) idxByKey.set(buckets[i].key, i);

  function bucketKeyForCreatedAt(createdAtISO: string): string {
    const d = isoFromAny(createdAtISO);
    return range === "30d" ? d : d.slice(0, 7);
  }

  function bucketKeyForDateOnly(dateISO: string): string {
    return range === "30d" ? dateISO : dateISO.slice(0, 7);
  }

  for (const e of emprestimos) {
    const key = bucketKeyForCreatedAt(e.created_at);
    const idx = idxByKey.get(key);
    if (idx == null) continue;
    evolucaoData[idx].emprestado = safeNum(evolucaoData[idx].emprestado) + safeNum(safeNum(e.payload?.valor));
  }

  for (const p of parcelas) {
    if (p.pago && p.pago_em) {
      const paidDate = isoFromAny(p.pago_em);
      const key = bucketKeyForDateOnly(paidDate);
      const idx = idxByKey.get(key);
      if (idx != null) {
        evolucaoData[idx].recebido = safeNum(evolucaoData[idx].recebido) + valorRecebidoTotal(p);
        const e = emprestimoById.get(String(p.emprestimo_id ?? ""));
        jurosData[idx].juros = safeNum(jurosData[idx].juros) + safeNum(parcelaJurosRecebido(p, e));
      }
    }
  }

  // Inadimplência por bucket (acumulada até o fim do bucket)
  for (let i = 0; i < buckets.length; i += 1) {
    const endISO = buckets[i].end;
    const vencidas = parcelas.filter((p) => String(p.vencimento) <= endISO);
    const totalDevidoLocal = vencidas.reduce((acc, p) => acc + safeNum(p.valor), 0);

    const emAtraso = vencidas.filter((p) => String(p.vencimento) < endISO && !isPaidByDate(p, endISO));
    const totalAtraso = emAtraso.reduce((acc, p) => acc + safeNum(p.valor), 0);

    const rate = totalDevidoLocal > 0 ? totalAtraso / totalDevidoLocal : 0;
    inadimplenciaData[i].inadimplencia = Math.round(rate * 1000) / 10; // % com 1 casa
  }

  // Parcelas a vencer (futuro): soma de parcelas não pagas com vencimento dentro do bucket e > hoje
  const futureEndISO = buckets[buckets.length - 1].end;
  const futuras = parcelas.filter(
    (p) => !p.pago && String(p.vencimento) > todayISO && String(p.vencimento) <= futureEndISO
  );

  for (const p of futuras) {
    const key = bucketKeyForDateOnly(String(p.vencimento));
    const idx = idxByKey.get(key);
    if (idx == null) continue;
    aVencerData[idx].aVencer = safeNum(aVencerData[idx].aVencer) + safeNum(safeNum(p.valor));
  }

  // =========================
  // Health (global até hoje)
  // =========================
  const vencidasAteHoje = parcelas.filter((p) => String(p.vencimento) <= todayISO);

  const totalDevido = vencidasAteHoje.reduce((acc, p) => acc + safeNum(p.valor), 0);

  // Total pago bruto (para métricas de recebimento)
  const totalPagoBruto = vencidasAteHoje
    .filter((p) => {
      const valorPago = valorRecebidoTotal(p);
      return Boolean(p.pago) || valorPago > 0;
    })
    .reduce((acc, p) => {
      return acc + valorRecebidoTotal(p);
    }, 0);

  // Lucro realizado (juros + multa) em todas as vencidas pagas
  const lucroRealizadoVencidas = lucroRealizadoTotal;

  const atrasadasEmAberto = vencidasAteHoje.filter((p) => String(p.vencimento) < todayISO && !isPaidByDate(p, todayISO));
  const totalAtrasadoEmAberto = atrasadasEmAberto.reduce((acc, p) => acc + safeNum(p.valor), 0);

  const recebimentoRate = totalDevido > 0 ? totalPagoBruto / totalDevido : 1;
  const inadimplenciaRate = totalDevido > 0 ? totalAtrasadoEmAberto / totalDevido : 0;

  const healthScore = Math.round(100 * (0.7 * recebimentoRate + 0.3 * (1 - inadimplenciaRate)));

  let status = "Excelente";
  let noteTitle = "Tudo em ordem!";
  let noteDesc = "Nenhum alerta no momento. Continue assim!";
  if (healthScore < 85) {
    status = "Bom";
    noteTitle = "Boa operação";
    noteDesc = "Há pequenos pontos para melhorar, mas está indo bem.";
  }
  if (healthScore < 70) {
    status = "Atenção";
    noteTitle = "Atenção";
    noteDesc = "Existem parcelas em atraso. Revise cobranças e prazos.";
  }
  if (healthScore < 50) {
    status = "Crítico";
    noteTitle = "Risco elevado";
    noteDesc = "Inadimplência alta. Priorize renegociação e cobranças.";
  }

  const weekCards: DashboardWeekCard[] = [
    { label: "Cobranças", value: cobrancasSemana, hint: "esta semana" },
    // Recebido (lucro/juros/multa) na semana
    { label: "Recebido no mês", value: brl(totalRecebidoMesComPagamentos), hint: "total registrado no mês" },
    { label: "Vence hoje", value: venceHoje, hint: "cobranças" },
    { label: "Vence amanhã", value: venceAmanha, hint: "cobranças" },
    { label: "Empréstimos", value: emprestimosSemana, hint: "esta semana" },
    { label: "Produtos", value: 0, hint: "esta semana" },
    { label: "Previsão de Lucro", value: brl(lucroPrevisto), hint: "valor a receber - capital" },
    { label: "Contratos", value: emprestimos.length, hint: "total" },
    { label: "Capital na Rua", value: brl(capitalEmprestado), hint: "capital emprestado" },
    // Lucro do mês (recebido - principal + 100% juros)
    { label: "Lucro no mês", value: brl(lucroMes), hint: "lucro realizado (mês atual)" },
    { label: "Em atraso", value: brl(totalAtrasadoEmAberto), hint: "aberto" },
    { label: "Clientes", value: clientesCount ?? 0, hint: "cadastrados" },
  ];

  const health: DashboardHealth = {
    score: Math.max(0, Math.min(100, healthScore)),
    status,
    desc: "Baseado em sua taxa de recebimento, inadimplência e liquidez em caixa.",
    bars: [
      { label: "Taxa de recebimento", value: `${(recebimentoRate * 100).toFixed(1)}%` },
      { label: "Inadimplência", value: `${(inadimplenciaRate * 100).toFixed(1)}%` },
      { label: "Recebido", value: brl(lucroRealizadoTotal) },
      { label: "Em atraso", value: brl(totalAtrasadoEmAberto) },
    ],
    noteTitle,
    noteDesc,
  };

  const rangeLabel = range === "30d" ? "últimos 30 dias" : range === "6m" ? "últimos 6 meses" : "últimos 12 meses";
  const roleLabel = isOwner ? "Dono (acesso total)" : "Funcionário";

  return {
    header: {
      title: email ? `Bem-vindo, ${email}` : "Bem-vindo de volta!",
      subtitle: "Gerencie seu sistema financeiro",
      roleLabel,
    },
    weekCards,
    charts: {
      evolucao: { title: `Evolução Financeira (${rangeLabel})`, data: evolucaoData, keys: ["emprestado", "recebido"] },
      juros: { title: `Juros Recebidos (${rangeLabel})`, data: jurosData, keys: ["juros"] },
      inadimplencia: { title: `Inadimplência (${rangeLabel})`, data: inadimplenciaData, keys: ["inadimplencia"] },
      aVencer: { title: `Parcelas a vencer (${rangeLabel})`, data: aVencerData, keys: ["aVencer"] },
    },
    health,
  };
}
