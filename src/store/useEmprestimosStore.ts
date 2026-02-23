// src/store/useEmprestimosStore.ts
import { create } from "zustand";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentTenantId } from "@/lib/tenant";
import { calcularTotais } from "@/components/emprestimos/emprestimoCalculos";
import type { NovoEmprestimoPayload } from "@/components/emprestimos/emprestimoTipos";
import type { Cliente } from "@/components/clientes/clienteTipos";

import {
  createEmprestimo,
  listEmprestimos,
  listPagamentosByEmprestimoDb,
  registrarPagamentoDbV2,
  estornarPagamentoDbV2,
  type PagamentoTipo,
  type PagamentoDb,
  type Emprestimo as EmprestimoModel,
} from "@/services/emprestimos.service";

// Alguns componentes importam este tipo do store.
export type Emprestimo = EmprestimoModel;

type State = {
  emprestimos: Emprestimo[];
  pagamentosByEmprestimo: Record<string, PagamentoDb[]>;
  loading: boolean;
  error: string | null;

  // Lista
  fetchEmprestimos: () => Promise<void>;

  // Realtime
  startRealtime: () => Promise<void>;
  stopRealtime: () => Promise<void>;

  // CRUD / ações
  criarEmprestimo: (payload: NovoEmprestimoPayload, cliente: Cliente | null) => Promise<Emprestimo | null>;
  removerEmprestimo: (id: string) => Promise<void>;
  mudarStatus: (id: string, status: string) => Promise<void>;

  // Pagamentos
  fetchPagamentos: (emprestimoId: string) => Promise<void>;
  registrarPagamento: (p: {
    emprestimoId: string;
    tipo: PagamentoTipo;
    dataPagamento: string; // YYYY-MM-DD
    valor: number;
    parcelaNumero?: number | null;
    jurosAtraso?: number;
    flags?: Record<string, any>;
  }) => Promise<void>;
  estornarPagamento: (p: { emprestimoId: string; pagamentoId: string; motivo?: string; isAdmin?: boolean }) => Promise<void>;

  // Compat (modal antigo)
  pagarParcela: (p: {
    emprestimoId: string;
    parcelaNumero: number; // 1-based
    valorPago: number;
    jurosAtraso?: number;
    dataPagamento: string;
  }) => Promise<void>;

  // Renovação (placeholder)
  renovarEmprestimo: (emprestimoId: string, motivo?: string) => Promise<void>;
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

// Realtime (auto atualização)
let __rt_channel: any = null;
let __rt_timer: any = null;

function __rt_scheduleRefresh(fn: () => void, ms = 250) {
  try {
    if (__rt_timer) clearTimeout(__rt_timer);
  } catch {}
  __rt_timer = setTimeout(() => {
    try {
      fn();
    } catch {}
  }, ms);
}

// Obs: `emprestimos.id` é UUID no banco (gerado automaticamente).

// Mapeia o retorno do banco (snake_case) para o que a UI costuma usar (camelCase)
function mapEmprestimoDb(row: any): any {
  if (!row) return row;

  const payload = (row.payload ?? {}) as Record<string, any>;
  const parcelas = row.parcelas ?? row.parcelasDb ?? [];

  // Se o banco não tiver colunas financeiras, elas vêm dentro de payload.
  const valor = Number(row.valor ?? payload.valor ?? 0);
  const parcelasCount = Number(
    row.numeroParcelas ?? row.numero_parcelas ?? payload.parcelas ?? payload.numeroParcelas ?? 0
  );

  // Se já existem parcelas no banco, usamos elas como fonte de verdade.
  const parcelasDb = Array.isArray(parcelas) ? parcelas : [];
  const totalParcelasDb = parcelasDb.reduce((acc: number, p: any) => acc + Number(p?.valor ?? 0), 0);

  // Totais calculados (fallback)
  const calcTotais = () => {
    const taxaJuros = Number(row.taxaJuros ?? payload.taxaJuros ?? 0);
    const jurosAplicado = (row.jurosAplicado ?? payload.jurosAplicado ?? "fixo") as any;
    const modalidade = (row.modalidade ?? payload.modalidade ?? "parcelado_mensal") as any;
    const parcelasN = Math.max(1, Number(parcelasCount || payload.parcelas || 1));

        return calcularTotais({ valor, taxaJuros, parcelas: parcelasN, jurosAplicado, modalidade });
  };

  const totais = calcTotais();

  // IMPORTANTE (amortização): quando existem parcelas no banco, elas viram a fonte de verdade.
  // Se mantivermos o payload.total_receber, os cards ficam “travados” no valor antigo.
  const totalReceber =
    totalParcelasDb > 0
      ? totalParcelasDb
      : Number(row.totalReceber ?? row.total_receber ?? payload.totalReceber ?? payload.total_receber ?? 0) ||
        Number(totais.totalAReceber ?? 0);

  const valorParcela =
    Number(row.valorParcela ?? row.valor_parcela ?? payload.valorParcela ?? payload.valor_parcela ?? 0) ||
    (parcelasDb[0]?.valor != null ? Number(parcelasDb[0].valor) : Number(totais.valorParcela ?? 0));

  const jurosTotal =
    Number(row.jurosTotal ?? row.juros_total ?? payload.jurosTotal ?? payload.juros_total ?? 0) ||
    Number(totais.jurosTotal ?? 0);

  return {
    ...row,

    // cliente
    clienteId: row.clienteId ?? row.cliente_id ?? row.cliente ?? row.clienteID,
    clienteNome:
      row.clienteNome ??
      row.cliente_nome ??
      payload.clienteNome ??
      payload.cliente_nome ??
      row.nome_cliente ??
      row.cliente_name ??
      row.clienteNomeCompleto,
    clienteContato:
      row.clienteContato ??
      row.cliente_contato ??
      payload.clienteContato ??
      payload.cliente_contato ??
      row.contato_cliente ??
      row.telefone ??
      row.telefone_cliente,

    // datas (vem do payload no schema atual)
    dataContrato: row.dataContrato ?? row.data_contrato ?? payload.dataContrato ?? payload.data_contrato ?? row.contrato_em ?? row.data,
    primeiraParcela:
      row.primeiraParcela ??
      row.primeira_parcela ??
      payload.primeiraParcela ??
      payload.primeira_parcela ??
      row.primeiro_vencimento,

    // valores
    valor,
    taxaJuros: Number(row.taxaJuros ?? row.taxa_juros ?? payload.taxaJuros ?? payload.taxa_juros ?? payload.juros ?? 0),
    jurosAplicado: row.jurosAplicado ?? row.juros_aplicado ?? payload.jurosAplicado ?? payload.juros_aplicado ?? row.juros_tipo,
    modalidade: row.modalidade ?? payload.modalidade ?? row.tipo ?? "parcelado_mensal",
    numeroParcelas:
      Number(row.numeroParcelas ?? row.numero_parcelas ?? payload.parcelas ?? payload.numeroParcelas ?? 0) ||
      (Array.isArray(parcelasDb) ? parcelasDb.length : 0),

    jurosTotal,
    totalReceber,
    valorParcela,

    vencimentos: row.vencimentos ?? payload.vencimentos ?? row.vencimentos_lista ?? row.vencimentos_json ?? row.vencimentosArr ?? row.vencimentos_array ?? [],

    // parcelas do banco
    parcelasDb: parcelasDb,

    // flags do contrato
    aplicarJurosAtraso: row.aplicarJurosAtraso ?? payload.aplicarJurosAtraso ?? false,
    jurosAtrasoTipo: row.jurosAtrasoTipo ?? payload.jurosAtrasoTipo,
    jurosAtrasoTaxa: row.jurosAtrasoTaxa ?? payload.jurosAtrasoTaxa,
    notificarWhatsapp: row.notificarWhatsapp ?? payload.notificarWhatsapp ?? false,

    // status
    status: row.status ?? "ativo",
  };
}


async function getEmprestimoById(emprestimoId: string) {
  const { data, error } = await supabase
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
            saldo_restante,
            pago_em,
            created_at,
            updated_at
          )
    `
    )
    .eq("id", emprestimoId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export const useEmprestimosStore = create<State>()((set, get) => ({
  emprestimos: [],
  pagamentosByEmprestimo: {},
  loading: false,
  error: null,

  
startRealtime: async () => {
  if (__rt_channel) return;

  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) return;

  const refreshAll = () => {
    __rt_scheduleRefresh(async () => {
      await get().fetchEmprestimos();
      // só refaz pagamentos já abertos/visitados (chaves existentes)
      const keys = Object.keys(get().pagamentosByEmprestimo || {});
      for (const k of keys) {
        try {
          await get().fetchPagamentos(k);
        } catch {}
      }
    });
  };

  const refreshEmprestimoById = (emprestimoId: string) => {
    __rt_scheduleRefresh(async () => {
      try {
        const row = await getEmprestimoById(emprestimoId);
        if (!row) {
          // se sumiu (delete) ou falha, faz refresh total para manter consistência
          await get().fetchEmprestimos();
          return;
        }

        const mapped = mapEmprestimoDb(row as any);

        set((s) => {
          const arr = Array.isArray(s.emprestimos) ? [...s.emprestimos] : [];
          const idx = arr.findIndex((e: any) => String(e?.id) === String(emprestimoId));
          if (idx >= 0) arr[idx] = mapped;
          else arr.unshift(mapped);
          return { emprestimos: arr };
        });
      } catch {
        // fallback seguro
        await get().fetchEmprestimos();
      }
    });
  };

  const refreshPagamentosByEmprestimoId = (emprestimoId: string) => {
    __rt_scheduleRefresh(async () => {
      try {
        await get().fetchPagamentos(emprestimoId);
      } catch {}
    });
  };

  const onChange = (payload: any) => {
    const table = String(payload?.table || "");
    const n = payload?.new ?? {};
    const o = payload?.old ?? {};

    const emprestimoId =
      (n?.emprestimo_id ?? o?.emprestimo_id ?? null) as string | null;

    if (table === "pagamentos") {
      // pagamento normalmente impacta: lista de pagamentos e saldo/parcelas → atualiza card do empréstimo
      if (emprestimoId) {
        refreshPagamentosByEmprestimoId(emprestimoId);
        refreshEmprestimoById(emprestimoId);
        return;
      }
      refreshAll();
      return;
    }

    if (table === "parcelas") {
      // parcela impacta o card do empréstimo
      if (emprestimoId) {
        refreshEmprestimoById(emprestimoId);
        return;
      }
      refreshAll();
      return;
    }

    if (table === "emprestimos") {
      const id = (n?.id ?? o?.id ?? null) as string | null;
      if (id) {
        refreshEmprestimoById(id);
        return;
      }
      refreshAll();
      return;
    }

    refreshAll();
  };

  // Realtime precisa filtrar pelo tenant_id (user_id no banco = tenant),
  // senão staff não recebe eventos.
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return;

  __rt_channel = supabase
    .channel(`rt-emprestimos-${tenantId}-${uid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "emprestimos", filter: `user_id=eq.${tenantId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "parcelas", filter: `user_id=eq.${tenantId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pagamentos", filter: `user_id=eq.${tenantId}` },
      onChange
    );

  await __rt_channel.subscribe();
},

stopRealtime:
 async () => {
    try {
      if (__rt_channel) {
        await supabase.removeChannel(__rt_channel);
      }
    } catch {}
    __rt_channel = null;
    try {
      if (__rt_timer) clearTimeout(__rt_timer);
    } catch {}
    __rt_timer = null;
  },

  fetchEmprestimos: async () => {
    set({ loading: true, error: null });
    try {
      const data = await listEmprestimos();
      const mapped = (data ?? []).map(mapEmprestimoDb);

      // Auto-reparo: se existir empréstimo sem parcelas no banco, recria parcelas a partir do payload.
      // Isso evita cards zerados/sem vencimento quando a base foi recriada.
      try {
        const uid = (await supabase.auth.getUser())?.data?.user?.id ?? null;

        for (const e of mapped) {
          const parcelasDb = Array.isArray((e as any).parcelasDb) ? ((e as any).parcelasDb as any[]) : [];
          if (parcelasDb.length > 0) continue;

          const p = ((e as any).payload ?? {}) as any;
          const parcelasN = Math.max(1, Number((e as any).numeroParcelas ?? p.parcelas ?? 1));
          const vencs: string[] =
            Array.isArray(p.vencimentos) && p.vencimentos.length === parcelasN
              ? (p.vencimentos as string[])
              : Array.from({ length: parcelasN }, () => String(p.primeiraParcela ?? todayYmd()));

          const totais = calcularTotais({
            valor: Number((e as any).valor ?? p.valor ?? 0),
            taxaJuros: Number((e as any).taxaJuros ?? p.taxaJuros ?? 0),
            parcelas: parcelasN,
            jurosAplicado: (p.jurosAplicado ?? "fixo") as any,
            modalidade: ((e as any).modalidade ?? p.modalidade ?? "parcelado_mensal") as any,
          });

          // Confere se já existe pelo menos 1 parcela no banco (evita duplicar)
          const chk = await supabase.from("parcelas").select("id").eq("emprestimo_id", e.id).limit(1);
          if (chk.error) continue;
          if ((chk.data ?? []).length > 0) continue;

          const rows = vencs.map((venc, i) => ({
            emprestimo_id: e.id,
            numero: i + 1,
            vencimento: venc,
            valor: Number(totais.valorParcela ?? 0),
            pago: false,
            valor_pago_acumulado: 0,
            juros_atraso: 0,
            saldo_restante: Number(totais.valorParcela ?? 0),
            ...(uid ? { user_id: uid } : {}),
          }));

          await supabase.from("parcelas").insert(rows);
        }
      } catch {
        // silencioso: não bloqueia a listagem
      }

      set({ emprestimos: mapped, loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao carregar empréstimos", loading: false });
    }
  },

  criarEmprestimo: async (payload, cliente) => {
    set({ loading: true, error: null });
    try {
      // IMPORTANTE:
      // O schema atual do Supabase para `emprestimos` possui colunas enxutas.
      // Tudo que for específico do contrato fica dentro de `payload` (jsonb).
      const insert: any = {
        cliente_id: payload.clienteId,
        cliente_nome: cliente?.nomeCompleto ?? "",
        cliente_contato: cliente?.telefone ?? "",
        status: "ativo",
        modalidade: payload.modalidade,
        payload: {
          ...payload,
          clienteNome: cliente?.nomeCompleto ?? "",
          clienteContato: cliente?.telefone ?? "",
        },
      };

            const created = await createEmprestimo(insert);

      // Gera e grava parcelas no banco (tabela `parcelas`).
      // IMPORTANTE: os cards e comprovantes dependem dessas parcelas para calcular valores e vencimentos.
      const uid = (await supabase.auth.getUser())?.data?.user?.id ?? null;

      const totais = calcularTotais({
        valor: Number(payload.valor ?? 0),
        taxaJuros: Number(payload.taxaJuros ?? 0),
        parcelas: Math.max(1, Number(payload.parcelas ?? 1)),
        jurosAplicado: payload.jurosAplicado,
        modalidade: payload.modalidade,
      });

      const vencs: string[] =
        Array.isArray(payload.vencimentos) && payload.vencimentos.length === Number(payload.parcelas)
          ? (payload.vencimentos as string[])
          : Array.from({ length: Math.max(1, Number(payload.parcelas ?? 1)) }, (_, i) => (payload.primeiraParcela || todayYmd()));

      const parcelasRows = vencs.map((venc, i) => ({
        emprestimo_id: created.id,
        numero: i + 1,
        vencimento: venc,
        valor: Number(totais.valorParcela ?? 0),
        pago: false,
        valor_pago_acumulado: 0,
        juros_atraso: 0,
        saldo_restante: Number(totais.valorParcela ?? 0),
        // se a policy exigir `user_id = auth.uid()`, enviamos explicitamente
        ...(uid ? { user_id: uid } : {}),
      }));

      const { error: parcelasErr } = await supabase.from("parcelas").insert(parcelasRows);
      if (parcelasErr) throw parcelasErr;

      // Recarrega com relacionamento de parcelas para garantir consistência na UI
      const { data: refreshed, error: refErr } = await supabase
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
            saldo_restante,
            pago_em,
            created_at,
            updated_at
          )
        `
        )
        .eq("id", created.id)
        .single();
      if (refErr) throw refErr;

      const mapped = mapEmprestimoDb(refreshed);

      set((s) => ({ emprestimos: [mapped, ...s.emprestimos], loading: false }));
      return mapped;
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao criar empréstimo", loading: false });
      return null;
    }
  },

  removerEmprestimo: async (id) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.from("emprestimos").delete().eq("id", id);
      if (error) throw error;

      set((s) => ({ emprestimos: s.emprestimos.filter((e) => e.id !== id), loading: false }));
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao remover empréstimo", loading: false });
    }
  },

  mudarStatus: async (id, status) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.from("emprestimos").update({ status }).eq("id", id);
      if (error) throw error;

      set((s) => ({
        emprestimos: s.emprestimos.map((e) => (e.id === id ? { ...e, status } : e)),
        loading: false,
      }));
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao atualizar status", loading: false });
    }
  },

  fetchPagamentos: async (emprestimoId) => {
    try {
      const data = await listPagamentosByEmprestimoDb(emprestimoId);
      set((s) => ({ pagamentosByEmprestimo: { ...s.pagamentosByEmprestimo, [emprestimoId]: (data ?? []) as any } }));
    } catch (e) {
      console.error(e);
    }
  },

  registrarPagamento: async ({ emprestimoId, tipo, dataPagamento, valor, parcelaNumero = null, jurosAtraso = 0, flags = {} }) => {
    set({ loading: true, error: null });
    try {
      await registrarPagamentoDbV2({ emprestimoId, tipo, dataPagamento, valor, parcelaNumero, jurosAtraso, flags });
      await get().fetchEmprestimos();
      await get().fetchPagamentos(emprestimoId);
      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao registrar pagamento", loading: false });
    }
  },

  estornarPagamento: async ({ emprestimoId, pagamentoId, motivo, isAdmin }) => {
    set({ loading: true, error: null });
    try {
      await estornarPagamentoDbV2({ pagamentoId, motivo, isAdmin: !!isAdmin });
      await get().fetchEmprestimos();
      await get().fetchPagamentos(emprestimoId);
      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao estornar pagamento", loading: false });
    }
  },

  pagarParcela: async ({ emprestimoId, parcelaNumero, valorPago, jurosAtraso = 0, dataPagamento }) => {
    set({ loading: true, error: null });
    try {
      await registrarPagamentoDbV2({
        emprestimoId,
        tipo: "PARCELA_INTEGRAL",
        dataPagamento: dataPagamento || todayYmd(),
        valor: (valorPago ?? 0) + (jurosAtraso ?? 0),
        parcelaNumero,
        jurosAtraso,
        flags: { origem: "ui_pagar_parcela" },
      });

      await get().fetchEmprestimos();
      await get().fetchPagamentos(emprestimoId);
      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao registrar pagamento", loading: false });
    }
  },

  renovarEmprestimo: async () => {
    return;
  },
}));
