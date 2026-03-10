import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CircleDollarSign,
  Download,
  Plus,
  RefreshCcw,
  Wallet,
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { usePermissoes } from "@/store/usePermissoes";
import { useAuthStore } from "@/store/useAuthStore";
import { commissionFactorFromPct, getStaffCommissionPct, scaleByCommission } from "@/lib/staffCommission";
import { type Emprestimo, type ParcelaDb } from "@/services/emprestimos.service";
import { listStaff, type StaffMember } from "@/services/funcionarios.service";

type MoneyRow = { label: string; value: number };

type Status = "em_atraso" | "hoje" | "ok";

type ContratoAtivoRow = {
  cliente: string;
  emprestado: number;
  pago: number;
  falta: number;
  status: Status;
  vencimento: string;
  vencimentoISO: string;
};

type ContratoAtrasoRow = {
  cliente: string;
  atraso: number;
  emprestado: number;
  vencimento: string;
  ticket: string;
};

type Lucro30Row = {
  id: string;
  dataRef: string;
  emprestimoId: string;
  cliente: string;
  tipo: string;
  valor: number;
  jurosAtraso: number;
  total: number;
};

type PagamentoRow = {
  id: string;
  emprestimo_id: string;
  tipo: string;
  valor: number;
  juros_atraso: number | null;
  data_pagamento: string | null;
  created_at: string | null;
  flags?: Record<string, any> | string | null;
  estornado_em?: string | null;
};

function getTodaySP(): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return new Date(`${year}-${month}-${day}T12:00:00Z`);
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBR(dISO: string): string {
  if (!dISO) return "-";
  const [y, m, d] = dISO.slice(0, 10).split("-");
  if (!y || !m || !d) return "-";
  return `${d}/${m}/${y}`;
}

function toISODateOnly(v: any): string {
  const s = String(v ?? "");
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function safeNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function applyEmprestimoScope<T>(query: T, userId: string): T {
  return (query as any).or(`created_by.eq.${userId},and(created_by.is.null,user_id.eq.${userId})`) as T;
}

function mapRelatorioEmprestimo(row: any): Emprestimo {
  const payload = (row?.payload ?? {}) as Record<string, any>;
  const valor = safeNumber(payload.valor ?? row?.valor);
  const numeroParcelas = safeNumber(payload.parcelas ?? row?.numero_parcelas ?? row?.numeroParcelas);
  const valorParcela = safeNumber(payload.valorParcela ?? payload.valor_parcela ?? row?.valor_parcela);
  const totalReceber = safeNumber(
    payload.totalReceber ?? payload.total_receber ?? payload.total_receber_calc ?? payload.total_receber_previsto
  );
  const clienteNome = String(payload.clienteNome ?? payload.cliente_nome ?? row?.cliente_nome ?? "").trim();

  return {
    id: String(row?.id ?? ""),
    user_id: String(row?.user_id ?? ""),
    clienteId: row?.cliente_id ? String(row.cliente_id) : "",
    clienteNome,
    clienteContato: String(row?.cliente_contato ?? ""),
    status: String(row?.status ?? "ativo"),
    modalidade: String(row?.modalidade ?? payload.modalidade ?? "mensal"),
    createdAt: String(row?.created_at ?? ""),
    payload,
    parcelasDb: ((row?.parcelas ?? []) as ParcelaDb[]) ?? [],
    valor,
    numeroParcelas,
    valorParcela,
    totalReceber,
    taxaJuros: safeNumber(payload.taxaJuros ?? row?.taxa_juros ?? row?.taxaJuros),
    jurosAplicado: payload.jurosAplicado ?? row?.juros_aplicado ?? row?.jurosAplicado,
  } as Emprestimo;
}

async function listEmprestimosForRelatorio(params: {
  canViewAll: boolean;
  currentUserId: string | null;
  scopedUserId: string | null;
}) {
  const { canViewAll, currentUserId, scopedUserId } = params;
  const filterUserId = canViewAll ? scopedUserId : currentUserId;
  if (!canViewAll && !filterUserId) return [];

  let query = supabase
    .from("emprestimos")
    .select(
      `
        id,
        user_id,
        created_by,
        cliente_id,
        cliente_nome,
        cliente_contato,
        status,
        modalidade,
        created_at,
        updated_at,
        payload,
        parcelas:parcelas(
          id,
          emprestimo_id,
          numero,
          descricao,
          referencia_parcela_numero,
          valor,
          vencimento,
          pago,
          valor_pago,
          valor_pago_acumulado,
          juros_atraso,
          multa_valor,
          acrescimos,
          saldo_restante,
          pago_em,
          created_at,
          updated_at
        )
      `
    )
    .order("created_at", { ascending: false });

  if (filterUserId) {
    query = applyEmprestimoScope(query, filterUserId);
  }

  const embedded = await query;
  if (!embedded.error) {
    return ((embedded.data ?? []) as any[]).map(mapRelatorioEmprestimo);
  }

  let fallbackQuery = supabase
    .from("emprestimos")
    .select(
      `
        id,
        user_id,
        created_by,
        cliente_id,
        cliente_nome,
        cliente_contato,
        status,
        modalidade,
        created_at,
        updated_at,
        payload
      `
    )
    .order("created_at", { ascending: false });

  if (filterUserId) {
    fallbackQuery = applyEmprestimoScope(fallbackQuery, filterUserId);
  }

  const fallback = await fallbackQuery;
  if (fallback.error) throw fallback.error;

  const emprestimosRows = (fallback.data ?? []) as any[];
  const ids = emprestimosRows.map((row) => String(row?.id ?? "")).filter(Boolean);

  const parcelasResp = ids.length
    ? await supabase
        .from("parcelas")
        .select(
          `
            id,
            emprestimo_id,
            numero,
            descricao,
            referencia_parcela_numero,
            valor,
            vencimento,
            pago,
            valor_pago,
            valor_pago_acumulado,
            juros_atraso,
            multa_valor,
            acrescimos,
            saldo_restante,
            pago_em,
            created_at,
            updated_at
          `
        )
        .in("emprestimo_id", ids)
    : { data: [] as ParcelaDb[], error: null as any };

  if (parcelasResp.error) throw parcelasResp.error;

  const parcelasByLoan = new Map<string, ParcelaDb[]>();
  for (const parcela of (parcelasResp.data ?? []) as ParcelaDb[]) {
    const loanId = String((parcela as any)?.emprestimo_id ?? "");
    if (!loanId) continue;
    const current = parcelasByLoan.get(loanId) ?? [];
    current.push(parcela);
    parcelasByLoan.set(loanId, current);
  }

  return emprestimosRows.map((row) =>
    mapRelatorioEmprestimo({
      ...row,
      parcelas: parcelasByLoan.get(String(row?.id ?? "")) ?? [],
    })
  );
}

function parsePaymentFlags(raw: any): Record<string, any> | null {
  try {
    if (!raw) return null;
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object") return raw;
  } catch {}
  return null;
}

function paymentDateRef(p: PagamentoRow): string {
  return toISODateOnly(p.data_pagamento ?? p.created_at);
}

function isAutoGeneratedProfitMirror(p: PagamentoRow): boolean {
  const flags = parsePaymentFlags(p.flags) ?? {};
  return Boolean((flags as any)?.juros_auto || (flags as any)?.origem_pagamento_id);
}

function isDirectProfitPayment(p: PagamentoRow): boolean {
  const flags = parsePaymentFlags(p.flags) ?? {};
  const tipo = String(p.tipo ?? "").toUpperCase();
  const modo = String((flags as any)?.modo ?? "").toUpperCase();
  const jurosAtraso = safeNumber(p.juros_atraso);

  return Boolean(
    tipo === "JUROS" ||
      (flags as any)?.contabilizar_como_lucro ||
      modo === "JUROS" ||
      (flags as any)?.juros_composto ||
      (tipo === "ADIANTAMENTO_MANUAL" && jurosAtraso > 0)
  );
}

function paymentTotalReceived(p: PagamentoRow): number {
  return safeNumber(p.valor) + safeNumber(p.juros_atraso);
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    em_atraso: { label: "Em Atraso", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
    hoje: { label: "Hoje", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    ok: { label: "Em Dia", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${s.cls}`}>
      {s.label}
    </span>
  );
}

function Card({
  icon,
  title,
  value,
  subtitle,
  tone = "emerald",
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle?: string;
  tone?: "emerald" | "amber" | "red" | "purple";
}) {
  const toneCls: Record<string, string> = {
    emerald: "border-emerald-500/25",
    amber: "border-amber-500/25",
    red: "border-red-500/25",
    purple: "border-purple-500/25",
  };
  return (
    <div className={`rounded-xl border ${toneCls[tone]} bg-slate-950/35 shadow-glow backdrop-blur-md p-4`}>
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">{icon}</span>
        <div className="font-medium">{title}</div>
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {subtitle ? <div className="mt-0.5 text-[11px] text-slate-400">{subtitle}</div> : null}
    </div>
  );
}

function SectionBox({
  title,
  rows,
  total,
  variant,
}: {
  title: string;
  rows: MoneyRow[];
  total: number;
  variant: "out" | "in";
}) {
  const isOut = variant === "out";
  return (
    <div
      className={
        "rounded-2xl border bg-slate-950/30 shadow-glow backdrop-blur-md overflow-hidden " +
        (isOut ? "border-red-500/25" : "border-emerald-500/25")
      }
    >
      <div className={"px-4 py-3 text-xs font-semibold tracking-wide " + (isOut ? "text-red-300" : "text-emerald-300")}>
        {title}
      </div>
      <div className={"border-t " + (isOut ? "border-red-500/15" : "border-emerald-500/15")}>
        {rows.map((r) => (
          <div
            key={r.label}
            className={
              "flex items-center justify-between px-4 py-2 text-sm border-b last:border-b-0 " +
              (isOut ? "border-red-500/10" : "border-emerald-500/10")
            }
          >
            <div className="flex items-center gap-2 text-slate-200">
              <span
                className={
                  "inline-flex h-4 w-4 items-center justify-center rounded border " +
                  (isOut ? "border-red-500/25 bg-red-500/10" : "border-emerald-500/25 bg-emerald-500/10")
                }
              />
              <span className="text-[13px]">{r.label}</span>
            </div>
            <div className={"text-[13px] font-semibold " + (isOut ? "text-red-300" : "text-emerald-300")}>
              {isOut ? "-" : "+"}
              {brl(Math.abs(r.value))}
            </div>
          </div>
        ))}
      </div>

      <div className={"px-4 py-2 text-right text-sm font-semibold " + (isOut ? "text-red-300" : "text-emerald-300")}>
        {isOut ? "-" : "+"}
        {brl(Math.abs(total))}
      </div>
    </div>
  );
}

function parcelaPagoValor(p: ParcelaDb): number {
  const v = (p as any).valor_pago_acumulado ?? (p as any).valor_pago ?? 0;
  const base = Math.max(0, safeNumber(v));
  // Fallback: quando a parcela está marcada como paga mas não há valor_pago preenchido,
  // usamos o valor original da parcela como pago.
  if (base === 0 && (p as any).pago) {
    return Math.max(0, safeNumber((p as any).valor ?? 0));
  }
  return base;
}

function parcelaSaldoRestante(p: ParcelaDb): number {
  const saldo = (p as any).saldo_restante;
  if (saldo != null) return Math.max(0, safeNumber(saldo));
  const valor = safeNumber((p as any).valor ?? 0);
  return Math.max(0, valor - parcelaPagoValor(p));
}

function parcelasAbertas(e: Emprestimo): ParcelaDb[] {
  const ps = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as ParcelaDb[]) : [];
  return ps.filter((p) => parcelaSaldoRestante(p) > 0.00001);
}

function sumSaldo(ps: ParcelaDb[]): number {
  return ps.reduce((a, p) => a + parcelaSaldoRestante(p), 0);
}

function sumAtraso(ps: ParcelaDb[], hoje: string): number {
  return ps
    .filter((p) => {
      const v = toISODateOnly((p as any).vencimento);
      return v && v < hoje;
    })
    .reduce((a, p) => a + parcelaSaldoRestante(p), 0);
}

function nextVencimento(ps: ParcelaDb[]): string {
  const dates = ps
    .map((p) => toISODateOnly((p as any).vencimento))
    .filter(Boolean)
    .sort();
  return dates[0] ?? "";
}

function statusContrato(psAbertas: ParcelaDb[], hoje: string): Status {
  const venc = nextVencimento(psAbertas);
  const atraso = sumAtraso(psAbertas, hoje);
  if (atraso > 0.00001) return "em_atraso";
  if (venc && venc === hoje) return "hoje";
  return "ok";
}

export default function RelatorioOperacional() {
  const location = useLocation();
  const { isOwner, isAdmin } = usePermissoes();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [pagamentosRegistros, setPagamentosRegistros] = useState<PagamentoRow[]>([]);
  const [lucro30Rows, setLucro30Rows] = useState<Lucro30Row[]>([]);
  const [staffRows, setStaffRows] = useState<StaffMember[]>([]);
  const [reportScope, setReportScope] = useState("__all__");
  const [staffCommissionPct, setStaffCommissionPct] = useState(0);
  const lucro30Ref = useRef<HTMLDivElement | null>(null);
  const canChooseScope = isAdmin;
  const scopedUserId = useMemo(() => {
    if (!canChooseScope) return user?.id ?? null;
    if (reportScope === "__all__") return null;
    if (reportScope === "__self__") return user?.id ?? null;
    return reportScope;
  }, [canChooseScope, reportScope, user?.id]);

  const selectedScopeStaff = useMemo(() => {
    if (!scopedUserId) return null;
    return staffRows.find((staff) => staff.auth_user_id === scopedUserId) ?? null;
  }, [staffRows, scopedUserId]);

  const selectedScopeLabel = useMemo(() => {
    if (!canChooseScope) return "Meu escopo";
    if (reportScope === "__all__") return "Todos os contratos";
    if (reportScope === "__self__") return "Meu escopo";
    return selectedScopeStaff?.nome || selectedScopeStaff?.email || "Staff";
  }, [canChooseScope, reportScope, selectedScopeStaff]);

  const hojeISO = useMemo(() => toISODateOnly(getTodaySP().toISOString()), []);
  const inicioMesISO = useMemo(() => {
    const d = getTodaySP();
    d.setUTCDate(1);
    return d.toISOString().slice(0, 10);
  }, []);

  async function carregar() {
    setLoading(true);
    setError(null);
    try {
      const todaySP = getTodaySP();
      const start30 = new Date(todaySP);
      start30.setDate(todaySP.getDate() - 30);
      const start30ISO = start30.toISOString().split("T")[0];
      const todaySPISO = todaySP.toISOString().split("T")[0];
      const emp = await listEmprestimosForRelatorio({
        canViewAll: canChooseScope,
        currentUserId: user?.id ?? null,
        scopedUserId,
      });
      const emprestimoIds = ((emp ?? []) as any[]).map((e) => String(e?.id ?? "")).filter(Boolean);

      const pagamentosResp = emprestimoIds.length
        ? await supabase
            .from("pagamentos")
            .select("id, emprestimo_id, tipo, valor, juros_atraso, data_pagamento, created_at, flags, estornado_em")
            .in("emprestimo_id", emprestimoIds)
            .is("estornado_em", null)
        : { data: [] as PagamentoRow[], error: null as any };

      setEmprestimos((emp ?? []) as any);
      if (pagamentosResp.error) throw pagamentosResp.error;

      const pagamentosTodos = ((pagamentosResp.data ?? []) as PagamentoRow[]).filter((p) => !p.estornado_em);
      setPagamentosRegistros(pagamentosTodos);

      const nomeByEmprestimo = new Map<string, string>();
      for (const e of (emp ?? []) as any[]) {
        nomeByEmprestimo.set(String(e?.id ?? ""), String(e?.clienteNome ?? e?.cliente_nome ?? "Cliente"));
      }

      const rows30Pagamentos = pagamentosTodos
        .filter((p) => {
          const ref = paymentDateRef(p);
          return Boolean(ref) && ref >= start30ISO && ref <= todaySPISO;
        })
        .filter((p) => {
          return isDirectProfitPayment(p) && !isAutoGeneratedProfitMirror(p);
        })
        .map((p) => {
          const valor = safeNumber(p.valor);
          const juros = safeNumber(p.juros_atraso);
          return {
            id: String(p.id ?? ""),
            dataRef: paymentDateRef(p),
            emprestimoId: String(p.emprestimo_id ?? ""),
            cliente: nomeByEmprestimo.get(String(p.emprestimo_id ?? "")) ?? "Cliente",
            tipo: String(p.tipo ?? ""),
            valor,
            jurosAtraso: juros,
            total: paymentTotalReceived(p),
          } as Lucro30Row;
        })
        .sort((a, b) => b.dataRef.localeCompare(a.dataRef));

      const pagamentosByLoan = new Map<string, PagamentoRow[]>();
      for (const payment of pagamentosTodos) {
        const loanId = String(payment.emprestimo_id ?? "");
        if (!loanId) continue;
        const current = pagamentosByLoan.get(loanId) ?? [];
        current.push(payment);
        pagamentosByLoan.set(loanId, current);
      }

      const lucro30Base = (emp ?? []).reduce((acc, loan) => {
        const loanId = String((loan as any).id ?? "");
        const payments = [...(pagamentosByLoan.get(loanId) ?? [])].sort((a, b) =>
          paymentDateRef(a).localeCompare(paymentDateRef(b))
        );
        let principalRemaining = safeNumber((loan as any).valor ?? 0);
        let total = 0;

        for (const payment of payments) {
          const ref = paymentDateRef(payment);
          if (!ref) continue;
          if (isAutoGeneratedProfitMirror(payment) || isDirectProfitPayment(payment)) continue;

          const value = safeNumber(payment.valor);
          const juros = safeNumber(payment.juros_atraso);
          const principalPart = Math.min(value, principalRemaining);
          principalRemaining = Math.max(0, principalRemaining - principalPart);
          const profitPart = Math.max(0, value - principalPart) + juros;

          if (ref >= start30ISO && ref <= todaySPISO) {
            total += profitPart;
          }
        }

        return acc + total;
      }, 0);

      const rows30 = [
        {
          id: "__view_30d__",
          dataRef: todaySPISO,
          emprestimoId: "",
          cliente: "Base consolidada (parcelas pagas)",
          tipo: "VIEW_30D",
          valor: safeNumber(lucro30Base),
          jurosAtraso: 0,
          total: safeNumber(lucro30Base),
        } as Lucro30Row,
        ...rows30Pagamentos,
      ];
      setLucro30Rows(rows30);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Falha ao carregar dados do relatório.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicioMesISO, hojeISO, canChooseScope, scopedUserId, user?.id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void carregar();
      }, 250);
    };

    const channel = supabase
      .channel("relatorio-operacional-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "emprestimos" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "parcelas" }, debouncedRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, debouncedRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (canChooseScope) {
          const staff = await listStaff();
          if (alive) setStaffRows(staff.filter((row) => row.active));
        } else if (alive) {
          setStaffRows([]);
        }

        if (canChooseScope && scopedUserId && scopedUserId !== user?.id) {
          if (alive) setStaffCommissionPct(Number(selectedScopeStaff?.commission_pct ?? 0));
          return;
        }

        if (isOwner || !user?.id) {
          if (alive) setStaffCommissionPct(0);
          return;
        }
        const pct = await getStaffCommissionPct(user.id);
        if (alive) setStaffCommissionPct(pct);
      } catch (e) {
        console.error("Falha ao carregar percentual do funcionário:", e);
        if (alive) setStaffCommissionPct(0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [canChooseScope, isOwner, scopedUserId, selectedScopeStaff?.commission_pct, user?.id]);

  useEffect(() => {
    if (loading) return;
    const focus = new URLSearchParams(location.search).get("focus");
    if (focus !== "lucro30d") return;
    setTimeout(() => {
      lucro30Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [location.search, loading]);

  const staffCommissionFactor = useMemo(() => {
    if (canChooseScope && (!scopedUserId || scopedUserId === user?.id)) return 1;
    if (isOwner) return 1;
    return commissionFactorFromPct(staffCommissionPct);
  }, [canChooseScope, isOwner, scopedUserId, staffCommissionPct, user?.id]);

  const emprestimosAtivos = useMemo(() => {
    return emprestimos.filter((e) => {
      const status = String((e as any).status ?? "").toLowerCase();
      return status !== "cancelado" && status !== "arquivado";
    });
  }, [emprestimos]);

  const emprestimosAtivosIds = useMemo(
    () => new Set(emprestimosAtivos.map((e) => String((e as any).id ?? "")).filter(Boolean)),
    [emprestimosAtivos]
  );

  const pagamentosAtivos = useMemo(
    () => pagamentosRegistros.filter((p) => emprestimosAtivosIds.has(String(p.emprestimo_id ?? ""))),
    [pagamentosRegistros, emprestimosAtivosIds]
  );

  const resumoPagamentosPorEmprestimo = useMemo(() => {
    const pagamentosByLoan = new Map<string, PagamentoRow[]>();

    for (const payment of pagamentosAtivos) {
      const loanId = String(payment.emprestimo_id ?? "");
      if (!loanId) continue;
      const current = pagamentosByLoan.get(loanId) ?? [];
      current.push(payment);
      pagamentosByLoan.set(loanId, current);
    }

    const summary = new Map<
      string,
      {
        principalRecovered: number;
        principalRemaining: number;
        totalReceived: number;
        totalProfit: number;
        receivedMonth: number;
        profitMonth: number;
      }
    >();

    for (const loan of emprestimosAtivos) {
      const loanId = String((loan as any).id ?? "");
      const payments = [...(pagamentosByLoan.get(loanId) ?? [])].sort((a, b) =>
        paymentDateRef(a).localeCompare(paymentDateRef(b))
      );
      const principal = safeNumber((loan as any).valor ?? 0);
      let principalRemaining = principal;
      let principalRecovered = 0;
      let totalReceived = 0;
      let totalProfit = 0;
      let receivedMonth = 0;
      let profitMonth = 0;

      for (const payment of payments) {
        const ref = paymentDateRef(payment);
        if (!ref) continue;
        if (isAutoGeneratedProfitMirror(payment)) continue;

        const value = safeNumber(payment.valor);
        const juros = safeNumber(payment.juros_atraso);
        const total = paymentTotalReceived(payment);
        const inMonth = ref >= inicioMesISO && ref <= hojeISO;

        totalReceived += total;

        if (isDirectProfitPayment(payment)) {
          totalProfit += total;
          if (inMonth) {
            receivedMonth += total;
            profitMonth += total;
          }
          continue;
        }

        const principalPart = Math.min(value, principalRemaining);
        principalRemaining = Math.max(0, principalRemaining - principalPart);
        principalRecovered += principalPart;
        const profitPart = Math.max(0, value - principalPart) + juros;
        totalProfit += profitPart;

        if (inMonth) {
          receivedMonth += total;
          profitMonth += profitPart;
        }
      }

      summary.set(loanId, {
        principalRecovered,
        principalRemaining,
        totalReceived,
        totalProfit,
        receivedMonth,
        profitMonth,
      });
    }

    return summary;
  }, [emprestimosAtivos, pagamentosAtivos, inicioMesISO, hojeISO]);

  const pagamentosRecebidosMes = useMemo(
    () => [...resumoPagamentosPorEmprestimo.values()].reduce((acc, item) => acc + item.receivedMonth, 0),
    [resumoPagamentosPorEmprestimo]
  );

  const lucroRealizadoMes = useMemo(
    () => [...resumoPagamentosPorEmprestimo.values()].reduce((acc, item) => acc + item.profitMonth, 0),
    [resumoPagamentosPorEmprestimo]
  );

  const principalRecebidoMes = useMemo(
    () => Math.max(0, pagamentosRecebidosMes - lucroRealizadoMes),
    [pagamentosRecebidosMes, lucroRealizadoMes]
  );

  const jurosRecebidosMes = lucroRealizadoMes;

  const emprestimosConcedidosMes = useMemo(() => {
    return emprestimos
      .filter((e) => {
        const createdISO = toISODateOnly((e as any).createdAt ?? (e as any).created_at);
        return createdISO && createdISO >= inicioMesISO && createdISO <= hojeISO;
      })
      .reduce((a, e) => a + safeNumber((e as any).valor ?? 0), 0);
  }, [emprestimos, inicioMesISO, hojeISO]);

  const { capitalNaRua, emAtraso } = useMemo(() => {
    let naRua = 0;
    let atraso = 0;
    for (const e of emprestimosAtivos) {
      const ab = parcelasAbertas(e);
      naRua += sumSaldo(ab);
      atraso += sumAtraso(ab, hojeISO);
    }
    return { capitalNaRua: naRua, emAtraso: atraso };
  }, [emprestimosAtivos, hojeISO]);

  const jurosPrevistos = useMemo(() => {
    return emprestimosAtivos.reduce((acc, loan) => {
      const loanId = String((loan as any).id ?? "");
      const saldoAberto = sumSaldo(parcelasAbertas(loan));
      const principalRemaining =
        resumoPagamentosPorEmprestimo.get(loanId)?.principalRemaining ?? safeNumber((loan as any).valor ?? 0);
      return acc + Math.max(0, saldoAberto - principalRemaining);
    }, 0);
  }, [emprestimosAtivos, resumoPagamentosPorEmprestimo]);

  const pagoTotalAtivos = useMemo(() => {
    return [...resumoPagamentosPorEmprestimo.values()].reduce((acc, item) => acc + item.totalReceived, 0);
  }, [resumoPagamentosPorEmprestimo]);

  const jurosAReceber = useMemo(() => {
    // Estimativa simples: juros previstos em contratos não cancelados menos juros já recebidos no mês.
    return Math.max(0, jurosPrevistos);
  }, [jurosPrevistos]);

  const resultadoPeriodo = useMemo(() => {
    // Resultado do período (mês atual) = entradas - saídas.
    // Não existe módulo de contas fixas/avulsas no projeto (logo, 0 aqui).
    return pagamentosRecebidosMes - emprestimosConcedidosMes;
  }, [pagamentosRecebidosMes, emprestimosConcedidosMes]);

  const indicadores = useMemo(() => {
    return {
      capitalNaRua,
      jurosAReceber,
      totalRecebido: pagamentosRecebidosMes,
      jurosRecebidos: jurosRecebidosMes,
      emAtraso,
      lucroRealizado: lucroRealizadoMes,
    };
  }, [capitalNaRua, jurosAReceber, pagamentosRecebidosMes, jurosRecebidosMes, emAtraso, lucroRealizadoMes]);

  const saidas: MoneyRow[] = useMemo(
    () => [
      { label: "Empréstimos concedidos", value: emprestimosConcedidosMes },
      { label: "Contas a pagar (fixas)", value: 0 },
      { label: "Contas avulsas", value: 0 },
    ],
    [emprestimosConcedidosMes]
  );

  const entradas: MoneyRow[] = useMemo(
    () => [
      { label: "Recuperação de capital", value: principalRecebidoMes },
      { label: "Lucro realizado", value: lucroRealizadoMes },
    ],
    [principalRecebidoMes, lucroRealizadoMes]
  );

  const distribuicao = useMemo(
    () => [
      { label: "Na Rua", valor: indicadores.capitalNaRua },
      { label: "Recebido", valor: indicadores.totalRecebido },
      { label: "Pendente", valor: indicadores.jurosAReceber },
      { label: "Atraso", valor: indicadores.emAtraso },
    ],
    [indicadores]
  );

  const evolucaoMensal = useMemo(() => {
    // Lucro por mês (últimos 12 meses): aloca cada recebimento como recuperação de principal até zerar o capital.
    const now = getTodaySP();
    const monthsCount = 12;

    const buckets: { key: string; label: string; lucro: number }[] = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" });
      buckets.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), lucro: 0 });
    }
    const idxByKey = new Map(buckets.map((b, idx) => [b.key, idx] as const));

    for (const loan of emprestimosAtivos) {
      const loanId = String((loan as any).id ?? "");
      if (!loanId) continue;

      const payments = pagamentosAtivos
        .filter((payment) => String(payment.emprestimo_id ?? "") === loanId)
        .sort((a, b) => paymentDateRef(a).localeCompare(paymentDateRef(b)));

      let principalRemaining = safeNumber((loan as any).valor ?? 0);

      for (const payment of payments) {
        const ref = paymentDateRef(payment);
        if (!ref) continue;

        const value = safeNumber(payment.valor);
        const juros = safeNumber(payment.juros_atraso);
        let lucroPart = 0;

        if (isDirectProfitPayment(payment)) {
          if (isAutoGeneratedProfitMirror(payment)) continue;
          lucroPart = paymentTotalReceived(payment);
        } else {
          const principalPart = Math.min(value, principalRemaining);
          principalRemaining = Math.max(0, principalRemaining - principalPart);
          lucroPart = Math.max(0, value - principalPart) + juros;
        }

        if (!(lucroPart > 0)) continue;

        const idx = idxByKey.get(ref.slice(0, 7));
        if (idx !== undefined) buckets[idx].lucro += lucroPart;
      }
    }

    return buckets.map((b) => ({ label: b.label, lucro: b.lucro }));
  }, [emprestimosAtivos, pagamentosAtivos]);

  const contratosAtivos: ContratoAtivoRow[] = useMemo(() => {
    return emprestimosAtivos
      .map((e) => {
        const loanId = String((e as any).id ?? "");
        const ab = parcelasAbertas(e);
        const venc = nextVencimento(ab);
        const pago = resumoPagamentosPorEmprestimo.get(loanId)?.totalReceived ?? 0;
        const falta = sumSaldo(ab);
        return {
          cliente: String((e as any).clienteNome ?? ""),
          emprestado: safeNumber((e as any).valor ?? 0),
          pago,
          falta,
          status: statusContrato(ab, hojeISO),
          vencimento: formatBR(venc),
          vencimentoISO: venc,
        };
      })
      .sort((a, b) => {
        const orderStatus = (s: Status) => (s === "em_atraso" ? 0 : s === "hoje" ? 1 : 2);
        const ds = orderStatus(a.status) - orderStatus(b.status);
        if (ds !== 0) return ds;
        return (a.vencimentoISO ?? "").localeCompare(b.vencimentoISO ?? "");
      })
      .slice(0, 5);
  }, [emprestimosAtivos, hojeISO, resumoPagamentosPorEmprestimo]);

  const contratosAtraso: ContratoAtrasoRow[] = useMemo(() => {
    return emprestimosAtivos
      .map((e) => {
        const ab = parcelasAbertas(e);
        const atraso = sumAtraso(ab, hojeISO);
        if (!(atraso > 0.00001)) return null;

        const venc = nextVencimento(
          ab.filter((p) => {
            const v = toISODateOnly((p as any).vencimento);
            return v && v < hojeISO;
          })
        );

        return {
          cliente: String((e as any).clienteNome ?? ""),
          atraso,
          emprestado: safeNumber((e as any).valor ?? 0),
          vencimento: formatBR(venc),
          // não existe "ticket" no banco; mantemos a coluna para preservar layout.
          ticket: String((e as any).id ?? "").slice(0, 8),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.atraso - a.atraso)
      .slice(0, 5) as ContratoAtrasoRow[];
  }, [emprestimosAtivos, hojeISO]);

  const scaleMoney = (value: number) => scaleByCommission(value, staffCommissionFactor);

  const displaySaidas = useMemo(
    () => saidas.map((row) => ({ ...row, value: scaleMoney(row.value) })),
    [saidas, staffCommissionFactor]
  );

  const displayEntradas = useMemo(
    () => entradas.map((row) => ({ ...row, value: scaleMoney(row.value) })),
    [entradas, staffCommissionFactor]
  );

  const displayResultadoPeriodo = useMemo(
    () => scaleMoney(resultadoPeriodo),
    [resultadoPeriodo, staffCommissionFactor]
  );

  const displayIndicadores = useMemo(
    () => ({
      capitalNaRua: scaleMoney(indicadores.capitalNaRua),
      jurosAReceber: scaleMoney(indicadores.jurosAReceber),
      totalRecebido: scaleMoney(indicadores.totalRecebido),
      jurosRecebidos: scaleMoney(indicadores.jurosRecebidos),
      emAtraso: scaleMoney(indicadores.emAtraso),
      lucroRealizado: scaleMoney(indicadores.lucroRealizado),
    }),
    [indicadores, staffCommissionFactor]
  );

  const displayPagoTotalAtivos = useMemo(
    () => scaleMoney(pagoTotalAtivos),
    [pagoTotalAtivos, staffCommissionFactor]
  );

  const displayDistribuicao = useMemo(
    () => distribuicao.map((item) => ({ ...item, valor: scaleMoney(item.valor) })),
    [distribuicao, staffCommissionFactor]
  );

  const displayEvolucaoMensal = useMemo(
    () => evolucaoMensal.map((item) => ({ ...item, lucro: scaleMoney(item.lucro) })),
    [evolucaoMensal, staffCommissionFactor]
  );

  const displayLucro30Rows = useMemo(
    () =>
      lucro30Rows.map((row) => ({
        ...row,
        valor: scaleMoney(row.valor),
        jurosAtraso: scaleMoney(row.jurosAtraso),
        total: scaleMoney(row.total),
      })),
    [lucro30Rows, staffCommissionFactor]
  );

  const displayLucro30Registrado = useMemo(
    () => displayLucro30Rows.reduce((acc, row) => acc + safeNumber(row.total), 0),
    [displayLucro30Rows]
  );

  const displayLucro30BaseRows = useMemo(
    () => displayLucro30Rows.filter((row) => row.tipo === "VIEW_30D"),
    [displayLucro30Rows]
  );

  const displayLucro30PagamentoRows = useMemo(
    () => displayLucro30Rows.filter((row) => row.tipo !== "VIEW_30D"),
    [displayLucro30Rows]
  );

  const displayLucro30PagamentosTotal = useMemo(
    () => displayLucro30PagamentoRows.reduce((acc, row) => acc + safeNumber(row.total), 0),
    [displayLucro30PagamentoRows]
  );

  const displayContratosAtivos = useMemo(
    () =>
      contratosAtivos.map((row) => ({
        ...row,
        emprestado: scaleMoney(row.emprestado),
        pago: scaleMoney(row.pago),
        falta: scaleMoney(row.falta),
      })),
    [contratosAtivos, staffCommissionFactor]
  );

  const displayContratosAtraso = useMemo(
    () =>
      contratosAtraso.map((row) => ({
        ...row,
        atraso: scaleMoney(row.atraso),
        emprestado: scaleMoney(row.emprestado),
      })),
    [contratosAtraso, staffCommissionFactor]
  );

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-white">Fluxo de Caixa</div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              {loading ? "Carregando" : error ? "Erro" : "Ao vivo"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Veja o saldo acumulado por período, quais contas pagaram e suas entradas e saídas, e o valor final da
            comparação.
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Período: {formatBR(inicioMesISO)} até {formatBR(hojeISO)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Escopo: {selectedScopeLabel}</div>
          {canChooseScope ? (
            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Visualizar relatório
              </label>
              <select
                value={reportScope}
                onChange={(event) => setReportScope(event.target.value)}
                className="w-full max-w-xs rounded-xl border border-emerald-500/20 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
              >
                <option value="__all__">Todos os contratos</option>
                <option value="__self__">Meu escopo</option>
                {staffRows
                  .filter((staff) => staff.auth_user_id !== user?.id)
                  .map((staff) => (
                    <option key={staff.auth_user_id} value={staff.auth_user_id}>
                      {(staff.nome || staff.email) + (staff.role === "admin" ? " (admin)" : " (staff)")}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          {staffCommissionFactor !== 1 ? (
            <div className="mt-2 text-[11px] text-emerald-300/80">
              Valores financeiros exibidos com {staffCommissionPct.toFixed(1)}% aplicado para {selectedScopeLabel}.
            </div>
          ) : null}
          {error ? <div className="mt-2 text-[11px] text-red-300">{error}</div> : null}
        </div>

        <button
          type="button"
          onClick={() => alert("Adicionar: em breve")}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/15"
        >
          <Plus size={16} />
          Adicionar
        </button>
      </div>

      {/* Saídas / Entradas */}
      <div className="mt-4 grid grid-cols-1 gap-3">
        <SectionBox title="SAÍDAS" rows={displaySaidas} total={displaySaidas.reduce((a, b) => a + b.value, 0)} variant="out" />
        <SectionBox title="ENTRADAS" rows={displayEntradas} total={displayEntradas.reduce((a, b) => a + b.value, 0)} variant="in" />
      </div>

      {/* Resultado do período */}
      <div className="mt-3 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 shadow-glow backdrop-blur-md px-4 py-6 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300">
          <CircleDollarSign size={16} /> Resultado do Período
        </div>
        <div className="mt-1 text-2xl font-extrabold text-emerald-200">
          {displayResultadoPeriodo >= 0 ? "+" : "-"}
          {brl(Math.abs(displayResultadoPeriodo))}
        </div>
        <div className="mt-0.5 text-[11px] text-emerald-200/70">ENTRADAS - SAÍDAS DO CAIXA</div>
      </div>

      {/* 3 cards grandes */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-300">
            <Wallet size={16} /> Na Rua
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-200">{brl(displayIndicadores.capitalNaRua)}</div>
          <div className="mt-1 text-[11px] text-amber-200/70">VALOR A RECEBER</div>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-300">
            <CircleDollarSign size={16} /> Lucro
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-200">{brl(displayIndicadores.lucroRealizado)}</div>
          <div className="mt-1 text-[11px] text-emerald-200/70">JUROS RECEBIDOS (PERÍODO)</div>
        </div>

        <div className="rounded-2xl border border-purple-500/25 bg-purple-950/10 shadow-glow backdrop-blur-md p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-purple-300">
            <CircleDollarSign size={16} /> Pago
          </div>
          <div className="mt-2 text-2xl font-extrabold text-purple-200">{brl(displayPagoTotalAtivos)}</div>
          <div className="mt-1 text-[11px] text-purple-200/70">TOTAL PAGO EM CONTRATOS ATIVOS</div>
        </div>
      </div>

      {/* Linha de cards */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card icon={<Wallet size={16} />} title="Capital na Rua" value={brl(displayIndicadores.capitalNaRua)} subtitle="Em contratos ativos" tone="emerald" />
        <Card icon={<ArrowUpCircle size={16} />} title="Juros a Receber" value={brl(displayIndicadores.jurosAReceber)} subtitle="Estimado" tone="amber" />
        <Card icon={<ArrowDownCircle size={16} />} title="Total Recebido" value={brl(displayIndicadores.totalRecebido)} subtitle="No período" tone="emerald" />
        <Card icon={<CircleDollarSign size={16} />} title="Juros Recebidos" value={brl(displayIndicadores.jurosRecebidos)} subtitle="No período" tone="emerald" />
        <Card icon={<AlertTriangle size={16} />} title="Em Atraso" value={brl(displayIndicadores.emAtraso)} subtitle="Saldo vencido" tone="red" />
        <Card icon={<CircleDollarSign size={16} />} title="Lucro Realizado" value={brl(displayIndicadores.lucroRealizado)} subtitle="Juros recebidos" tone="purple" />
      </div>

      {/* Gráficos */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Evolução Mensal</div>
            <button
              type="button"
              onClick={() => void carregar()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
              title="Recarregar"
            >
              <RefreshCcw size={14} />
              Atualizar
            </button>
          </div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayEvolucaoMensal} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => brl(Number(value || 0))} />
                <Bar dataKey="lucro" name="Lucro" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            * Histórico calculado a partir dos pagamentos registrados, respeitando recuperação de principal por contrato.
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md p-4">
          <div className="text-sm font-semibold text-white">Distribuição</div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayDistribuicao}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="label" strokeOpacity={0.6} />
                <YAxis strokeOpacity={0.6} />
                <Tooltip />
                <Bar dataKey="valor" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabelas */}
      <div className="mt-3 grid grid-cols-1 gap-3">
        <div ref={lucro30Ref} className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-sm font-semibold text-white">Detalhamento Lucro (30 dias)</div>
            <div className="text-xs text-emerald-200">Total registrado: {brl(displayLucro30Registrado)}</div>
          </div>

          <div className="border-t border-white/10">
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-xs font-semibold text-slate-400">Base consolidada (30 dias)</div>
              <div className="mt-1 text-sm text-slate-200">
                {brl(displayLucro30BaseRows.reduce((acc, r) => acc + safeNumber(r.total), 0))}
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-xs font-semibold text-slate-300">Pagamentos de lucro avulsos</div>
              <div className="text-xs text-emerald-200">Subtotal: {brl(displayLucro30PagamentosTotal)}</div>
            </div>

            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold text-slate-400">
              <div className="col-span-2">Data</div>
              <div className="col-span-4">Cliente</div>
              <div className="col-span-2">Tipo</div>
              <div className="col-span-2 text-right">Valor</div>
              <div className="col-span-2 text-right">Total</div>
            </div>

            {displayLucro30PagamentoRows.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400">Nenhum pagamento de lucro avulso registrado nos ultimos 30 dias.</div>
            ) : (
              displayLucro30PagamentoRows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-white/5">
                  <div className="col-span-2 text-slate-300">{formatBR(r.dataRef)}</div>
                  <div className="col-span-4 text-slate-200 truncate">{r.cliente}</div>
                  <div className="col-span-2 text-emerald-200">{r.tipo}</div>
                  <div className="col-span-2 text-right text-slate-200">{brl(r.valor)}</div>
                  <div className="col-span-2 text-right text-emerald-200 font-semibold">{brl(r.total)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-sm font-semibold text-white">Contratos Ativos (Na Rua)</div>
            <button
              type="button"
              onClick={() => alert("Exportar: em breve")}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              <Download size={14} />
              Exportar
            </button>
          </div>

          <div className="border-t border-white/10">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold text-slate-400">
              <div className="col-span-4">Cliente</div>
              <div className="col-span-2 text-right">Emprestado</div>
              <div className="col-span-2 text-right">Pago</div>
              <div className="col-span-2 text-right">Falta</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-1 text-right">Venc.</div>
            </div>

            {displayContratosAtivos.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400">Nenhum contrato ativo encontrado.</div>
            ) : (
              displayContratosAtivos.map((r, idx) => (
                <div
                  key={`${r.cliente}-${idx}`}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-white/5"
                >
                  <div className="col-span-4 text-slate-200 truncate">{r.cliente || "-"}</div>
                  <div className="col-span-2 text-right text-emerald-200 font-semibold">{brl(r.emprestado)}</div>
                  <div className="col-span-2 text-right text-slate-200">{brl(r.pago)}</div>
                  <div className="col-span-2 text-right text-slate-200">{brl(r.falta)}</div>
                  <div className="col-span-1 flex justify-center">
                    <StatusPill status={r.status} />
                  </div>
                  <div className="col-span-1 text-right text-slate-300">{r.vencimento}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-red-500/20 bg-slate-950/30 shadow-glow backdrop-blur-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-sm font-semibold text-white">Contratos em Atraso</div>
            <button
              type="button"
              onClick={() => alert("Exportar: em breve")}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              <Download size={14} />
              Exportar
            </button>
          </div>

          <div className="border-t border-white/10">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-semibold text-slate-400">
              <div className="col-span-4">Cliente</div>
              <div className="col-span-2 text-right">Atraso</div>
              <div className="col-span-2 text-right">Emprestado</div>
              <div className="col-span-2 text-right">Venc.</div>
              <div className="col-span-2 text-right">Ticket</div>
            </div>

            {displayContratosAtraso.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400">Nenhum contrato em atraso.</div>
            ) : (
              displayContratosAtraso.map((r, idx) => (
                <div
                  key={`${r.cliente}-${idx}`}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-white/5"
                >
                  <div className="col-span-4 text-slate-200 truncate">{r.cliente || "-"}</div>
                  <div className="col-span-2 text-right text-red-300 font-semibold">{brl(r.atraso)}</div>
                  <div className="col-span-2 text-right text-slate-200">{brl(r.emprestado)}</div>
                  <div className="col-span-2 text-right text-slate-300">{r.vencimento}</div>
                  <div className="col-span-2 text-right text-slate-400">{r.ticket}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
