import { supabase } from "@/lib/supabaseClient";

/**
 * Service de empréstimos (Supabase)
 *
 * Observação importante:
 * - A tabela `emprestimos` pode não ter colunas financeiras (total_receber, lucro_previsto, etc).
 * - Muitos projetos armazenam isso em `payload` (jsonb).
 * - Por isso, este service devolve `payload` e também tenta normalizar campos usados no painel.
 */

// =============================
// Pagamentos
// =============================

// Mantido para compatibilidade com RPCs antigos (register_payment)
export enum PagamentoTipoLegacy {
  PARCELA = "parcela",
  JUROS = "juros",
  AMBOS = "ambos",
}

// Novo modelo (aceite do vídeo)
export type PagamentoTipo =
  | "PARCELA_INTEGRAL"
  | "ADIANTAMENTO_MANUAL"
  | "JUROS"
  | "SALDO_PARCIAL"
  | "QUITACAO_TOTAL"
  | "DESCONTO";

export type PagamentoDb = {
  id: string;
  emprestimo_id: string;
  parcela_id: string | null;

  // Alguns selects/views trazem o número da parcela diretamente
  parcela_numero?: number | null;
  tipo: PagamentoTipo;
  valor: number;
  juros_atraso: number | null;
  data_pagamento: string;
  created_at: string;
  flags?: Record<string, any> | null;
  snapshot?: any;

  // auditoria
  estornado_em: string | null;
  estornado_motivo?: string | null;
};

export type ParcelaDb = {
  id: string;
  emprestimo_id: string;
  numero?: number | null;
  valor: number | null;
  vencimento: string | null;
  pago: boolean | null;
  valor_pago: number | null;
  juros_atraso: number | null;
  // parcial/adiantamento (podem não existir no banco)
  valor_pago_acumulado?: number | null;
  saldo_restante?: number | null;
  pago_em?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// Tipo usado por telas de cliente (ClienteDetalhe / ClienteDrawer)
export type ParcelaInfo = {
  id: string;
  emprestimoId?: string;
  numero: number;
  valor: number;
  vencimento: string;
  pago: boolean;
  valor_pago: number | null;
  juros_atraso: number | null;
  // parcial
  valor_pago_acumulado?: number | null;
  saldo_restante?: number | null;
  pago_em?: string | null;
};

export type EmprestimoPayload = Record<string, any> & {
  valor?: number;
  taxaJuros?: number;
  jurosAplicado?: number;
  parcelas?: number;
  diaVencimento?: number;
  modalidade?: string;
  totalReceber?: number;
  lucroPrevisto?: number;
  pago?: number;
};

export type EmprestimoDb = {
  id: string;
  user_id: string;
  created_by?: string | null;
  cliente_id: string;
  cliente_nome: string | null;
  cliente_contato: string | null;
  status: string | null;
  modalidade: string | null;
  created_at: string;
  updated_at: string;
  payload: EmprestimoPayload | null;
  parcelas?: ParcelaDb[];

  // campos calculados (view v_emprestimos_status)
  tenant_id?: string | null;
  parcelas_em_aberto?: number | null;
  parcelas_em_atraso?: number | null;
  dias_atraso_max?: number | null;
  em_atraso?: boolean | null;
  proximo_vencimento_em_aberto?: string | null;
};

export type Emprestimo = {
  id: string;
  user_id: string;
  clienteId: string;
  clienteNome: string;
  clienteContato: string;
  status: string;
  modalidade: string;
  createdAt: string;
  payload: EmprestimoPayload | null;
  parcelasDb: ParcelaDb[];

  // normalizados para UI
  valor: number;
  numeroParcelas: number;
  valorParcela: number;
  totalReceber: number;
  quitadoEm: string | null;

  // ─────────────────────────────
  // Campos usados pela UI (podem vir do payload)
  // ─────────────────────────────
  taxaJuros?: number;
  jurosAplicado?: any;
  jurosTotal?: number;

  dataContrato?: string;
  primeiraParcela?: string;
  vencimentos?: string[];

  parcelasPagas?: number[];

  aplicarJurosAtraso?: boolean;
  jurosAtrasoTipo?: "valor_por_dia" | "percentual_por_dia";
  jurosAtrasoTaxa?: number;

  notificarWhatsapp?: boolean;

  // ─────────────────────────────
  // Campos calculados (preferidos pela UI)
  // ─────────────────────────────
  emAtraso?: boolean;
  diasAtrasoMax?: number;
  parcelasEmAtraso?: number;
  parcelasEmAberto?: number;
  proximoVencimentoEmAberto?: string | null;
};

function toNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getPrincipalUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function applyPrincipalEmprestimoScope<T>(query: T, userId: string): T {
  return (query as any).or(`created_by.eq.${userId},and(created_by.is.null,user_id.eq.${userId})`) as T;
}

function mapEmprestimo(row: EmprestimoDb): Emprestimo {
  const payload = (row.payload ?? {}) as EmprestimoPayload;
  const valor = toNumber(payload.valor ?? (row as any).valor);
  const numeroParcelas = toNumber(payload.parcelas ?? (row as any).numero_parcelas ?? (row as any).numeroParcelas);
  const valorParcela = toNumber((payload as any).valorParcela ?? (payload as any).valor_parcela ?? (row as any).valor_parcela);
  const totalReceber = toNumber(
    (payload as any).totalReceber ??
      (payload as any).total_receber ??
      (payload as any).total_receber_calc ??
      (payload as any).total_receber_previsto
  );
  const nomePayload = String((payload as any).clienteNome ?? (payload as any).cliente_nome ?? "").trim();
  const nomeRow = String(row.cliente_nome ?? "").trim();
  const clienteNomeNormalizado = nomePayload || nomeRow || "";

  return {
    id: row.id,
    user_id: row.user_id,
    clienteId: row.cliente_id,
    clienteNome: clienteNomeNormalizado,
    clienteContato: row.cliente_contato ?? "",
    status: row.status ?? "ativo",
    modalidade: row.modalidade ?? (payload.modalidade ?? "mensal"),
    createdAt: row.created_at,
    payload,
    parcelasDb: (row.parcelas ?? []) as ParcelaDb[],

    valor,
    numeroParcelas,
    valorParcela,
    totalReceber,

    taxaJuros: toNumber(payload.taxaJuros ?? (row as any).taxa_juros ?? (row as any).taxaJuros),
    jurosAplicado: (payload as any).jurosAplicado ?? (row as any).juros_aplicado ?? (row as any).jurosAplicado,
    jurosTotal: toNumber((payload as any).jurosTotal ?? (payload as any).juros_total),

    dataContrato: String((payload as any).dataContrato ?? (payload as any).data_contrato ?? ""),
    primeiraParcela: String((payload as any).primeiraParcela ?? (payload as any).primeira_parcela ?? ""),
    vencimentos: Array.isArray((payload as any).vencimentos) ? ((payload as any).vencimentos as string[]) : undefined,

    aplicarJurosAtraso: Boolean((payload as any).aplicarJurosAtraso),
    jurosAtrasoTipo: (payload as any).jurosAtrasoTipo,
    jurosAtrasoTaxa: (payload as any).jurosAtrasoTaxa,
    notificarWhatsapp: Boolean((payload as any).notificarWhatsapp),

    // alguns bancos têm quitado_em como coluna, outros guardam em payload
    quitadoEm: (row as any).quitado_em ?? (payload as any).quitado_em ?? null,

    emAtraso: Boolean((row as any).em_atraso ?? (payload as any).em_atraso ?? false),
    diasAtrasoMax: toNumber((row as any).dias_atraso_max ?? (payload as any).dias_atraso_max),
    parcelasEmAtraso: toNumber((row as any).parcelas_em_atraso ?? (payload as any).parcelas_em_atraso),
    parcelasEmAberto: toNumber((row as any).parcelas_em_aberto ?? (payload as any).parcelas_em_aberto),
    proximoVencimentoEmAberto: (row as any).proximo_vencimento_em_aberto ?? (payload as any).proximo_vencimento_em_aberto ?? null,
  };
}

async function hydrateClienteNome(rows: any[]) {
  const ids = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => String((r as any)?.cliente_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (ids.length === 0) return rows;

  const { data, error } = await supabase
    .from("clientes")
    .select("id,nome,payload")
    .in("id", ids);

  if (error || !Array.isArray(data)) return rows;

  const byId = new Map<string, string>();
  for (const c of data as any[]) {
    const nomePayload = String(c?.payload?.nomeCompleto ?? c?.payload?.nome ?? "").trim();
    const nomeRow = String(c?.nome ?? "").trim();
    const nome = nomePayload || nomeRow;
    if (!nome) continue;
    byId.set(String(c.id), nome);
  }

  return (rows ?? []).map((r) => {
    const cid = String((r as any)?.cliente_id ?? "").trim();
    const nome = byId.get(cid);
    if (!nome) return r;
    return { ...(r as any), cliente_nome: nome };
  });
}

// =============================
// Empréstimos
// =============================

export async function listEmprestimos() {
  const userId = await getPrincipalUserId();
  if (!userId) return [];
  return listEmprestimosFallback(userId);
}


async function listEmprestimosFallback(userId: string) {
  // Tentativa 1: traz parcelas embutidas (FK).
  let r1q = supabase
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
  r1q = applyPrincipalEmprestimoScope(r1q, userId);
  const r1 = await r1q;

  if (!r1.error) return (r1.data ?? []).map(mapEmprestimo);

  // Fallback: se o relacionamento não existir / estiver quebrado no PostgREST,
  // busca emprestimos e parcelas separadamente e monta no client.
  let r2q = supabase
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
  r2q = applyPrincipalEmprestimoScope(r2q, userId);
  const r2 = await r2q;
  if (r2.error) throw r2.error;

  const emprestimos = (r2.data ?? []) as any[];
  const ids = emprestimos.map((e) => e.id).filter(Boolean);

  const pr = ids.length
    ? await supabase
        .from("parcelas")
        .select(
          `
            id,
            emprestimo_id,
            numero,
            valor,
            vencimento,
            pago,
            valor_pago_acumulado,
            juros_atraso,
            multa_valor,
            acrescimos,
            valor_pago_acumulado,
            saldo_restante,
            pago_em,
            created_at,
            updated_at
          `
        )
        .in("emprestimo_id", ids)
    : { data: [], error: null };

  if (pr.error) throw pr.error;
  const parcelas = (pr.data ?? []) as any[];
  const byEmp: Record<string, any[]> = {};
  for (const p of parcelas) {
    const k = String(p.emprestimo_id);
    (byEmp[k] ||= []).push(p);
  }

  const merged = emprestimos.map((e) => ({ ...e, parcelas: byEmp[String(e.id)] || [] }));
  const hydrated = await hydrateClienteNome(merged);
  return hydrated.map(mapEmprestimo);
}

/**
 * Lista empréstimos por cliente.
 *
 * OBS: Algumas telas (ClienteDetalhe/ClienteDrawer) esperam:
 * - `payload`
 * - `_parcelas` (array) com campos padrão de parcelas
 * - alguns campos planos como `createdAt` e `valorTotal`
 */
export async function listEmprestimosByCliente(clienteId: string) {
  const userId = await getPrincipalUserId();
  if (!userId) return [];

  let r1q = supabase
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
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });
  r1q = applyPrincipalEmprestimoScope(r1q, userId);
  const r1 = await r1q;

  let rows: any[] = [];
  if (!r1.error) {
    rows = (r1.data ?? []) as any[];
  } else {
    let r2q = supabase
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
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });
    r2q = applyPrincipalEmprestimoScope(r2q, userId);
    const r2 = await r2q;
    if (r2.error) throw r2.error;
    rows = (r2.data ?? []) as any[];

    const ids = rows.map((e) => e.id).filter(Boolean);
    const pr = ids.length
      ? await supabase
          .from("parcelas")
          .select(
            `
              id,
              emprestimo_id,
              numero,
              valor,
              vencimento,
              pago,
              valor_pago_acumulado,
              juros_atraso,
              multa_valor,
              acrescimos,
              valor_pago_acumulado,
              saldo_restante,
              pago_em,
              created_at,
              updated_at
            `
          )
          .in("emprestimo_id", ids)
      : { data: [], error: null };
    if (pr.error) throw pr.error;
    const parcelas = (pr.data ?? []) as any[];
    const byEmp: Record<string, any[]> = {};
    for (const p of parcelas) {
      const k = String(p.emprestimo_id);
      (byEmp[k] ||= []).push(p);
    }
    rows = rows.map((e) => ({ ...e, parcelas: byEmp[String(e.id)] || [] }));
  }
  return rows.map((row) => {
    const emp = mapEmprestimo(row as EmprestimoDb);

    // Forma esperada pelas telas de Cliente
    const parcelas: ParcelaInfo[] = (emp.parcelasDb ?? [])
      .filter(Boolean)
      .map((p) => ({
        id: String(p.id),
        numero: Number(p.numero ?? 0),
        valor: Number(p.valor ?? 0),
        vencimento: String(p.vencimento ?? ""),
        pago: Boolean(p.pago),
        valor_pago: p.valor_pago_acumulado ?? null,
        juros_atraso: p.juros_atraso ?? null,
        valor_pago_acumulado: (p as any).valor_pago_acumulado ?? null,
        saldo_restante: (p as any).saldo_restante ?? null,
        pago_em: (p as any).pago_em ?? null,
      }));

    const payload = (emp.payload ?? {}) as any;
    const valorTotal =
      toNumber(payload.totalReceber) ||
      toNumber(payload.total_receber) ||
      toNumber(payload.total) ||
      toNumber(payload.total_receber_calc) ||
      emp.totalReceber ||
      0;

    return {
      ...emp,
      // compat antigos
      created_at: row.created_at,
      createdAt: emp.createdAt,
      valorTotal,
      total: valorTotal,
      _parcelas: parcelas,
    };
  });
}

export async function getEmprestimoById(emprestimoId: string) {
  const userId = await getPrincipalUserId();
  if (!userId) return null;

  // Traz um único empréstimo com parcelas (se FK estiver ok); fallback para busca separada.
  let r1q = supabase
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
    .eq("id", emprestimoId)
    .maybeSingle();
  r1q = applyPrincipalEmprestimoScope(r1q, userId);
  const r1 = await r1q;

  if (!r1.error && r1.data) return mapEmprestimo(r1.data as any);

  let r2q = supabase
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
    .eq("id", emprestimoId)
    .maybeSingle();
  r2q = applyPrincipalEmprestimoScope(r2q, userId);
  const r2 = await r2q;

  if (r2.error) throw r2.error;
  if (!r2.data) return null;

  const pr = await supabase
    .from("parcelas")
    .select(
      `
        id,
        emprestimo_id,
        numero,
        valor,
        vencimento,
        pago,
        valor_pago_acumulado,
        juros_atraso,
        multa_valor,
        acrescimos,
        valor_pago_acumulado,
        saldo_restante,
        pago_em,
        created_at,
        updated_at
      `
    )
    .eq("emprestimo_id", emprestimoId)
    .order("numero", { ascending: true });

  if (pr.error) throw pr.error;

  return mapEmprestimo({ ...(r2.data as any), parcelas: pr.data ?? [] } as any);
}

export async function createEmprestimo(payload: any) {
  const userId = await getPrincipalUserId();
  if (!userId) throw new Error("Sessão inválida para criar empréstimo.");
  const scopedPayload = { ...payload, user_id: userId, created_by: userId };
  const { data, error } = await supabase.from("emprestimos").insert(scopedPayload).select("*").single();
  if (error) throw error;
  return data;
}

// =============================
// Pagamentos - leitura
// =============================

export async function listPagamentosByEmprestimoDb(emprestimoId: string) {
  const userId = await getPrincipalUserId();
  if (!userId) return [];

  let ownLoanQuery = supabase.from("emprestimos").select("id").eq("id", emprestimoId).limit(1).maybeSingle();
  ownLoanQuery = applyPrincipalEmprestimoScope(ownLoanQuery, userId);
  const ownLoan = await ownLoanQuery;
  if (ownLoan.error) throw ownLoan.error;
  if (!ownLoan.data) return [];

  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("emprestimo_id", emprestimoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PagamentoDb[];
}

// =============================
// Pagamentos - escrita (V2 + fallback)
// =============================

/**
 * Novo fluxo: registra pagamento conforme regras do vídeo.
 * Tenta primeiro o RPC novo `rpc_registrar_pagamento`.
 * Se não existir, faz fallback no RPC legado `register_payment` (somente parcela integral).
 */
export async function registrarPagamentoDbV2(args: {
  emprestimoId: string;
  tipo: PagamentoTipo;
  dataPagamento: string; // YYYY-MM-DD
  valor: number;
  parcelaNumero?: number | null;
  jurosAtraso?: number;
  flags?: Record<string, any>;
}) {
  const {
    emprestimoId,
    tipo,
    dataPagamento,
    valor,
    parcelaNumero = null,
    jurosAtraso = 0,
    flags = {},
  } = args;

  // 1) RPC novo
  const r1 = await supabase.rpc("rpc_registrar_pagamento", {
    p_emprestimo_id: emprestimoId,
    p_tipo: tipo,
    p_data_pagamento: dataPagamento,
    p_valor: valor,
    p_parcela_numero: parcelaNumero,
    p_juros_atraso: jurosAtraso,
    p_flags: flags,
  });

  const parsePagamentoIdFromRpc = (rpcData: any): string | null => {
    if (!rpcData) return null;
    if (typeof rpcData === "string") return rpcData;
    if (typeof rpcData === "object" && rpcData.pagamento_id) return String(rpcData.pagamento_id);
    return null;
  };

  const resolveBaseFromEmprestimo = (emp: any) => {
    const payload = emp?.payload ?? {};
    const principal = toNumber(
      emp?.principal ??
        emp?.valor ??
        payload?.principal ??
        payload?.valor ??
        payload?.valorEmprestado ??
        payload?.capital
    );
    const totalReceber = toNumber(
      emp?.total_receber ??
        payload?.totalReceber ??
        payload?.total_receber ??
        payload?.valorTotal ??
        payload?.valor_a_receber
    );
    const numeroParcelas = Math.max(
      0,
      toNumber(emp?.numero_parcelas ?? payload?.parcelas ?? payload?.numeroParcelas ?? payload?.numero_parcelas)
    );
    const principalPorParcela = numeroParcelas > 0 ? principal / numeroParcelas : principal;
    return { principal, totalReceber, numeroParcelas, principalPorParcela };
  };

  const parseSnapshotParcelas = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const autoRegistrarJurosLucro = async (pagamentoId: string | null) => {
    const tipoUpper = String(tipo ?? "").toUpperCase();
    if (!["PARCELA_INTEGRAL", "SALDO_PARCIAL", "QUITACAO_TOTAL"].includes(tipoUpper)) return;

    const valorRegistrado = toNumber(valor) + toNumber(jurosAtraso);
    if (!(valorRegistrado > 0)) return;

    const [{ data: emprestimo, error: empErr }, { data: pagamento, error: payErr }] = await Promise.all([
      supabase.from("emprestimos").select("*").eq("id", emprestimoId).maybeSingle(),
      pagamentoId ? supabase.from("pagamentos").select("*").eq("id", pagamentoId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (empErr || !emprestimo) return;
    if (payErr) return;

    const base = resolveBaseFromEmprestimo(emprestimo as any);
    let capitalComponente = 0;
    let jurosParcelaNumero: number | null = parcelaNumero != null ? Number(parcelaNumero) : null;

    if (tipoUpper === "QUITACAO_TOTAL") {
      const snapshot = parseSnapshotParcelas((pagamento as any)?.snapshot_parcelas);
      const unpaid = snapshot.filter((p) => !Boolean(p?.pago));
      const unpaidCount = unpaid.length;
      const qtdPrincipal = unpaidCount > 0 ? unpaidCount : Math.max(1, base.numeroParcelas || 1);
      capitalComponente = Math.max(0, base.principalPorParcela) * qtdPrincipal;
      if (!jurosParcelaNumero) {
        const candidato = unpaid[0]?.numero ?? snapshot[0]?.numero ?? null;
        jurosParcelaNumero = candidato != null ? Number(candidato) : null;
      }
    } else {
      capitalComponente = Math.max(0, base.principalPorParcela);
    }

    const lucroCalculado = Math.max(0, valorRegistrado - capitalComponente);
    if (!(lucroCalculado > 0)) return;

    if (!jurosParcelaNumero || !Number.isFinite(jurosParcelaNumero) || jurosParcelaNumero <= 0) {
      const { data: parc } = await supabase
        .from("parcelas")
        .select("numero")
        .eq("emprestimo_id", emprestimoId)
        .order("numero", { ascending: true })
        .limit(1)
        .maybeSingle();
      jurosParcelaNumero = parc?.numero != null ? Number(parc.numero) : null;
    }
    if (!jurosParcelaNumero || !Number.isFinite(jurosParcelaNumero) || jurosParcelaNumero <= 0) return;

    // Evita duplicar lançamento automático para o mesmo pagamento.
    const { data: existingRows } = await supabase
      .from("pagamentos")
      .select("id, flags")
      .eq("emprestimo_id", emprestimoId)
      .eq("tipo", "JUROS")
      .is("estornado_em", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const hasAuto = (existingRows ?? []).some((r: any) => {
      const f = (r?.flags ?? {}) as any;
      return String(f?.origem_pagamento_id ?? "") === String(pagamentoId ?? "");
    });
    if (hasAuto) return;

    await supabase.rpc("rpc_registrar_pagamento", {
      p_emprestimo_id: emprestimoId,
      p_tipo: "JUROS",
      p_data_pagamento: dataPagamento,
      p_valor: lucroCalculado,
      p_parcela_numero: jurosParcelaNumero,
      p_juros_atraso: 0,
      p_flags: {
        ...(flags ?? {}),
        modo: "JUROS",
        contabilizar_como_lucro: true,
        juros_auto: true,
        origem_pagamento_id: pagamentoId,
        origem_tipo_pagamento: tipoUpper,
        formula_lucro: "registrado_menos_capital",
      },
    });
  };

  if (!r1.error) {
    const pagamentoId = parsePagamentoIdFromRpc(r1.data);
    try {
      await autoRegistrarJurosLucro(pagamentoId);
    } catch (e) {
      console.warn("Falha ao registrar juros automático:", e);
    }
    return r1.data;
  }

  // 2) Fallback legado
  if (tipo !== "PARCELA_INTEGRAL") throw r1.error;

  let parcelaId: string | null = null;
  if (parcelaNumero != null) {
    const { data: parcela, error: pErr } = await supabase
      .from("parcelas")
      .select("id")
      .eq("emprestimo_id", emprestimoId)
      .eq("numero", parcelaNumero)
      .limit(1)
      .maybeSingle();
    if (pErr) throw pErr;
    parcelaId = (parcela as any)?.id ?? null;
  }

  const r2 = await supabase.rpc("register_payment", {
    p_emprestimo_id: emprestimoId,
    p_parcela_id: parcelaId,
    p_valor_pago: valor,
    p_juros_pago: jurosAtraso,
    p_tipo: PagamentoTipoLegacy.PARCELA,
    p_observacao: flags?.observacao ?? null,
  });

  if (r2.error) throw r2.error;
  return r2.data;
}

/**
 * Estorno com auditoria.
 * Tenta `rpc_estornar_pagamento`, fallback para `revert_payment`.
 */
export async function estornarPagamentoDbV2(args: {
  pagamentoId: string;
  motivo?: string;
  isAdmin?: boolean;
}) {
  const { pagamentoId, motivo = null, isAdmin = false } = args;

  const r1 = await supabase.rpc("rpc_estornar_pagamento", {
    p_pagamento_id: pagamentoId,
    p_motivo: motivo,
    p_is_admin: isAdmin,
  });

  if (!r1.error) return r1.data;

  const r2 = await supabase.rpc("revert_payment", { p_pagamento_id: pagamentoId });
  if (r2.error) throw r2.error;
  return r2.data;
}

export async function atualizarDataPagamentoDb(args: {
  pagamentoId: string;
  dataPagamento: string;
}) {
  const { pagamentoId, dataPagamento } = args;

  const { data: pay, error: payErr } = await supabase
    .from("pagamentos")
    .select("id, emprestimo_id, parcela_id, tipo, estornado_em")
    .eq("id", pagamentoId)
    .maybeSingle();
  if (payErr) throw payErr;
  if (!pay) throw new Error("Pagamento não encontrado.");
  if (pay.estornado_em) throw new Error("Não é possível editar data de pagamento estornado.");

  const { error: updErr } = await supabase
    .from("pagamentos")
    .update({ data_pagamento: dataPagamento })
    .eq("id", pagamentoId);
  if (updErr) throw updErr;

  // Mantém consistência básica de datas exibidas no contrato/parcela.
  if (pay.tipo === "QUITACAO_TOTAL") {
    await supabase
      .from("emprestimos")
      .update({ quitado_em: `${dataPagamento}T00:00:00` })
      .eq("id", pay.emprestimo_id);

    await supabase
      .from("parcelas")
      .update({ pago_em: dataPagamento })
      .eq("emprestimo_id", pay.emprestimo_id)
      .eq("pago", true);
  } else if (pay.parcela_id) {
    await supabase
      .from("parcelas")
      .update({ pago_em: dataPagamento })
      .eq("id", pay.parcela_id)
      .eq("pago", true);
  }

  return true;
}

// =============================
// Compatibilidade (antigos nomes)
// =============================

export async function registrarPagamentoDb(args: {
  emprestimoId: string;
  parcelaId?: string | null;
  valorPago: number;
  jurosPago?: number;
  tipo?: PagamentoTipoLegacy;
  observacao?: string;
}) {
  const {
    emprestimoId,
    parcelaId = null,
    valorPago,
    jurosPago = 0,
    tipo = PagamentoTipoLegacy.PARCELA,
    observacao,
  } = args;

  const { data, error } = await supabase.rpc("register_payment", {
    p_emprestimo_id: emprestimoId,
    p_parcela_id: parcelaId,
    p_valor_pago: valorPago,
    p_juros_pago: jurosPago,
    p_tipo: tipo,
    p_observacao: observacao ?? null,
  });

  if (error) throw error;
  return data;
}

export async function estornarPagamentoDb(args: { pagamentoId: string }) {
  const { pagamentoId } = args;

  const { data, error } = await supabase.rpc("revert_payment", {
    p_pagamento_id: pagamentoId,
  });

  if (error) throw error;
  return data;
}
