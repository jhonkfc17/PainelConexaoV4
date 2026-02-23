// src/services/emprestimos.service.ts
// -----------------------------------------------------------------------------
// Serviço de Empréstimos + Pagamentos (Supabase)
// Substitui/centraliza as chamadas antigas de "pagarParcela" e adiciona histórico.
// Compatível com:
// - emprestimos.id : text
// - parcelas.id    : bigint
// - emprestimos.user_id : uuid (tenant)
// -----------------------------------------------------------------------------
//
// NOTAS IMPORTANTES
// 1) NÃO declare variáveis duplicadas no mesmo escopo (ex: const now = ...), pois
//    isso quebra o build no Vercel (Linux) com "already been declared".
// 2) Sempre prefira enviar data de pagamento selecionada (YYYY-MM-DD) para o RPC.
// 3) IDs:
//    - emprestimoId: string (pois emprestimos.id é text)
//    - parcelaId: number (pois parcelas.id é bigint)

import { supabase } from "@/lib/supabaseClient";

// -------------------- Tipos --------------------

export type PagamentoTipo =
  | "PARCELA_INTEGRAL"
  | "ADIANTAMENTO_MANUAL"
  | "PARCIAL_COMPLEMENTO"
  | "QUITACAO_TOTAL";

// Estruturas mínimas (ajuste conforme seu types/mapping)
export type ParcelaDb = {
  id: number; // bigint
  emprestimo_id: string; // text
  numero: number;
  valor: number;
  juros_atraso?: number | null;

  pago: boolean;
  pago_em?: string | null; // date (YYYY-MM-DD) ou timestamp, conforme schema
  valor_pago?: number | null;

  // novos campos (se você já aplicou o DDL)
  valor_pago_acumulado?: number | null;
  saldo_restante?: number | null;
};

export type EmprestimoDb = {
  id: string; // text
  user_id: string; // uuid
  status?: string | null;
  quitado_em?: string | null;

  // campos comuns no seu app (ajuste conforme schema real)
  valor?: number | null; // principal
  taxa_juros?: number | null;
  juros_total?: number | null;
  total_receber?: number | null;

  parcelas?: ParcelaDb[];
};

export type PagamentoDb = {
  id: string; // uuid
  user_id: string; // uuid tenant
  emprestimo_id: string; // text
  parcela_id: number | null; // bigint
  tipo: PagamentoTipo;
  valor: number;
  data_pagamento: string; // date
  criado_por: string;
  created_at: string;
  estornado_em: string | null;
  estornado_por: string | null;
  motivo_estorno: string | null;
  metadata: any;
};

// -------------------- Helpers --------------------

function assertOk<T>(data: T | null, error: any): T {
  if (error) throw error;
  return data as T;
}

// -------------------- Queries (Leitura) --------------------

/**
 * Lista empréstimos com parcelas (mantém compatibilidade com seu listEmprestimos atual):
 * select emprestimos com parcelas(*)
 */
export async function listEmprestimosDb(): Promise<EmprestimoDb[]> {
  const { data, error } = await supabase
    .from("emprestimos")
    .select("*, parcelas(*)")
    .order("created_at", { ascending: false });

  return assertOk<EmprestimoDb[]>(data ?? [], error);
}

/**
 * Lista pagamentos do histórico por emprestimo_id.
 * Depende da tabela public.pagamentos e policies de SELECT por tenant.
 */
export async function listPagamentosByEmprestimoDb(
  emprestimoId: string
): Promise<PagamentoDb[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("emprestimo_id", emprestimoId)
    .order("created_at", { ascending: false });

  return assertOk<PagamentoDb[]>(data ?? [], error);
}

// -------------------- RPCs (Escrita transacional) --------------------

/**
 * Registra pagamento via RPC transacional:
 * - PARCELA_INTEGRAL
 * - ADIANTAMENTO_MANUAL
 * - PARCIAL_COMPLEMENTO
 * - QUITACAO_TOTAL
 *
 * Observação:
 * - parcelaId é bigint (number)
 * - parcelaNumero é int
 * - dataPagamento é string 'YYYY-MM-DD' (obrigatório)
 */
export async function registrarPagamentoDb(params: {
  emprestimoId: string;
  tipo: PagamentoTipo;
  dataPagamento: string; // YYYY-MM-DD

  // obrigatório para adiantamento/complemento (menor/<= saldo)
  valor?: number | null;

  // escolha 1: parcelaId OU parcelaNumero (exceto QUITACAO_TOTAL)
  parcelaId?: number | null;
  parcelaNumero?: number | null;

  jurosAtraso?: number | null;
  flags?: Record<string, any>;
}): Promise<string> {
  const { data, error } = await supabase.rpc("rpc_registrar_pagamento", {
    p_emprestimo_id: params.emprestimoId,
    p_tipo: params.tipo,
    p_data_pagamento: params.dataPagamento,
    p_valor: params.valor ?? null,
    p_parcela_id: params.parcelaId ?? null,
    p_parcela_numero: params.parcelaNumero ?? null,
    p_juros_atraso: params.jurosAtraso ?? 0,
    p_flags: params.flags ?? {},
  });

  // RPC retorna uuid do pagamento
  return assertOk<string>(data, error);
}

/**
 * Estorna pagamento via RPC transacional (soft delete / auditoria).
 * Regra do vídeo:
 * - ADIANTAMENTO_MANUAL só admin (validado no RPC)
 */
export async function estornarPagamentoDb(params: {
  pagamentoId: string;
  motivo?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("rpc_estornar_pagamento", {
    p_pagamento_id: params.pagamentoId,
    p_motivo: params.motivo ?? null,
  });

  if (error) throw error;
}

// -------------------- Compatibilidade (antigo pagarParcela) --------------------

/**
 * Wrapper compatível com sua action antiga pagarParcela().
 * Se o seu código antigo chama payParcelaDb(parcelaId/numero, ...),
 * mantenha esta função e aponte para o novo RPC.
 *
 * Importante: NÃO usa now() fixo: passe dataPagamento selecionada pelo usuário.
 */
export async function payParcelaDb(params: {
  emprestimoId: string;
  parcelaNumero?: number; // se seu fluxo escolhe por numero
  parcelaId?: number; // se seu fluxo usa id bigint
  dataPagamento: string; // YYYY-MM-DD
}): Promise<string> {
  return registrarPagamentoDb({
    emprestimoId: params.emprestimoId,
    tipo: "PARCELA_INTEGRAL",
    dataPagamento: params.dataPagamento,
    parcelaNumero: params.parcelaNumero ?? null,
    parcelaId: params.parcelaId ?? null,
  });
}

// -------------------- Utilidades de cálculo (opcional) --------------------

/**
 * Calcula total a quitar no front usando parcelas (mensal/diário).
 * Usa saldo_restante se existir; caso contrário calcula por (valor+juros - valor_pago_acumulado).
 */
export function calcularTotalAQuitacao(emprestimo: EmprestimoDb): number {
  const parcelas = emprestimo.parcelas ?? [];
  let total = 0;

  for (const p of parcelas) {
    const juros = p.juros_atraso ?? 0;
    const pagoAcum = p.valor_pago_acumulado ?? 0;

    const saldoRestante =
      p.saldo_restante != null && !Number.isNaN(p.saldo_restante)
        ? p.saldo_restante
        : Math.max(0, (p.valor ?? 0) + juros - pagoAcum);

    if (p.pago && saldoRestante === 0) continue;
    total += Math.max(0, saldoRestante);
  }

  // arredonda 2 casas
  return Math.round(total * 100) / 100;
}

/**
 * Lucro previsto = totalReceber - principal
 */
export function lucroPrevisto(emprestimo: EmprestimoDb): number {
  const principal = emprestimo.valor ?? 0;
  const totalReceber = emprestimo.total_receber ?? 0;
  const v = totalReceber - principal;
  return Math.round(v * 100) / 100;
}

/**
 * Lucro realizado (regra explícita):
 * total_recebido = soma pagamentos não estornados
 * principal_recuperado = min(total_recebido, principal)
 * lucro_realizado = total_recebido - principal_recuperado
 */
export function lucroRealizado(params: {
  emprestimo: EmprestimoDb;
  pagamentos: PagamentoDb[];
}): number {
  const principal = params.emprestimo.valor ?? 0;

  const totalRecebido = (params.pagamentos ?? [])
    .filter((p) => !p.estornado_em)
    .reduce((acc, p) => acc + (p.valor ?? 0), 0);

  const principalRecuperado = Math.min(totalRecebido, principal);
  const lucro = totalRecebido - principalRecuperado;

  return Math.round(lucro * 100) / 100;
}


