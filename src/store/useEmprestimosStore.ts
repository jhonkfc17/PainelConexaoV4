// src/store/useEmprestimosStore.ts
import { create } from "zustand";
import { supabase } from "@/lib/supabaseClient";
import { calcularTotais } from "@/components/emprestimos/emprestimoCalculos";
import type { NovoEmprestimoPayload } from "@/components/emprestimos/emprestimoTipos";
import type { Cliente } from "@/components/clientes/clienteTipos";
import { ajustarParaDiaCobravel, fromISODate, gerarVencimentosParcelas, toISODate } from "@/utils/datasCobranca";

import {
  createEmprestimo,
  listEmprestimos,
  listPagamentosByEmprestimoDb,
  registrarPagamentoDbV2,
  estornarPagamentoDbV2,
  atualizarDataPagamentoDb,
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
  atualizarDataPagamento: (p: { emprestimoId: string; pagamentoId: string; dataPagamento: string }) => Promise<void>;

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

function mapModalidadeCronograma(modalidade: string): "mensal" | "quinzenal" | "semanal" | "diario" {
  const m = String(modalidade ?? "").toLowerCase();
  if (m === "diario") return "diario";
  if (m === "semanal") return "semanal";
  if (m === "quinzenal") return "quinzenal";
  return "mensal";
}

// Normaliza modalidade para o conjunto aceito por `calcularTotais`.
// O projeto historicamente usa valores variados (ex.: "mensal", "parcelado_mensal", "price").
function normModalidadeCalculos(v: any):
  | "parcelado_mensal"
  | "quinzenal"
  | "semanal"
  | "diario"
  | "tabela_price" {
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return "parcelado_mensal";
  if (s.includes("price")) return "tabela_price";
  if (s.includes("diar")) return "diario";
  if (s.includes("seman")) return "semanal";
  if (s.includes("quin")) return "quinzenal";
  // qualquer variante de mensal/parcelado
  return "parcelado_mensal";
}

function diffDaysIso(aISO: string, bISO: string) {
  const a = fromISODate(aISO);
  const b = fromISODate(bISO);
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

async function renovarContratoPreservandoConfiguracao(emprestimoId: string, dataBaseISO: string) {
  const row = await getEmprestimoById(emprestimoId);
  if (!row) throw new Error("Empréstimo não encontrado para renovar.");

  const mapped = mapEmprestimoDb(row as any);
  const payload = ((row as any)?.payload ?? {}) as Record<string, any>;

  const numeroParcelas = Math.max(
    1,
    Number(
      mapped?.numeroParcelas ??
      payload?.parcelas ??
      payload?.numeroParcelas ??
      ((row as any)?.parcelas?.length ?? 1)
    )
  );

  const modalidade = String(mapped?.modalidade ?? payload?.modalidade ?? "parcelado_mensal");
  const jurosAplicado = (mapped?.jurosAplicado ?? payload?.jurosAplicado ?? payload?.juros_aplicado ?? "fixo") as any;
  const taxaJuros = Number(mapped?.taxaJuros ?? payload?.taxaJuros ?? payload?.taxa_juros ?? 0);
  const valorEmprestado = Number(mapped?.valor ?? payload?.valor ?? 0);

  const totais = calcularTotais({
    valor: valorEmprestado,
    taxaJuros,
    parcelas: numeroParcelas,
    jurosAplicado,
    modalidade: modalidade as any,
  });

  let totalReceber = Number(
    payload?.totalReceber ??
    payload?.total_receber ??
    mapped?.totalReceber ??
    totais?.totalAReceber ??
    0
  );
  if (!(totalReceber > 0)) totalReceber = Number(totais?.totalAReceber ?? 0);

  const valorParcela = Number(
    (
      Number(payload?.valorParcela ?? payload?.valor_parcela ?? 0) ||
      Number(totais?.valorParcela ?? 0) ||
      (totalReceber / numeroParcelas)
    )
  );

  const modalidadeCron = mapModalidadeCronograma(modalidade);
  const normalizaIsoDia = (v: any) => String(v ?? "").slice(0, 10);

  const prazoDiasInformado = Number(
    payload?.prazoDias ??
      payload?.prazo_dias ??
      payload?.prazo ??
      0
  );

  const dataContratoOriginal = normalizaIsoDia(
    payload?.dataContrato ??
      payload?.data_contrato ??
      mapped?.dataContrato
  );
  const primeiraParcelaOriginal = normalizaIsoDia(
    payload?.primeiraParcela ??
      payload?.primeira_parcela ??
      mapped?.primeiraParcela ??
      (Array.isArray(payload?.vencimentos) ? payload.vencimentos?.[0] : "")
  );

  const prazoDiasDerivado =
    dataContratoOriginal && primeiraParcelaOriginal
      ? diffDaysIso(primeiraParcelaOriginal, dataContratoOriginal)
      : 0;

  const prazoPadraoModalidade =
    modalidadeCron === "diario"
      ? 1
      : modalidadeCron === "semanal"
        ? 7
        : modalidadeCron === "quinzenal"
          ? 14
          : 30;

  const prazoDiasOriginal = Math.max(
    0,
    Number.isFinite(prazoDiasInformado) && prazoDiasInformado > 0
      ? prazoDiasInformado
      : prazoDiasDerivado > 0
        ? prazoDiasDerivado
        : prazoPadraoModalidade
  );

  const basePrimeira = fromISODate(dataBaseISO);
  basePrimeira.setDate(basePrimeira.getDate() + prazoDiasOriginal);
  const primeiraParcelaReferencia = toISODate(basePrimeira);

  const cobrarSabado = payload?.cobrarSabado !== false;
  const cobrarDomingo = payload?.cobrarDomingo !== false;
  const cobrarFeriados = payload?.cobrarFeriados !== false;
  const usarDiaFixoSemana = Boolean(payload?.usarDiaFixoSemana ?? payload?.usar_dia_fixo_semana ?? false);
  const diaSemanaCobranca = Number(payload?.diaSemanaCobranca ?? payload?.dia_semana_cobranca ?? 1);

  const primeiraParcelaAjustada = ajustarParaDiaCobravel({
    dataISO: primeiraParcelaReferencia,
    cobrarSabado,
    cobrarDomingo,
    cobrarFeriados,
  });

  const primeiraParcelaParaCronograma =
    (modalidadeCron === "semanal" || modalidadeCron === "quinzenal") && !usarDiaFixoSemana
      ? primeiraParcelaReferencia
      : primeiraParcelaAjustada;

  const vencimentos = gerarVencimentosParcelas({
    primeiraParcelaISO: primeiraParcelaParaCronograma,
    numeroParcelas,
    cobrarSabado,
    cobrarDomingo,
    cobrarFeriados,
    modalidade: modalidadeCron,
    diaFixoSemana:
      (modalidadeCron === "semanal" || modalidadeCron === "quinzenal") && usarDiaFixoSemana
        ? diaSemanaCobranca
        : undefined,
  });

  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id ?? null;

  const { error: delErr } = await supabase.from("parcelas").delete().eq("emprestimo_id", emprestimoId);
  if (delErr) throw delErr;

  const parcelasRows = vencimentos.map((venc, i) => ({
    emprestimo_id: emprestimoId,
    numero: i + 1,
    vencimento: venc,
    valor: Number(valorParcela || 0),
    pago: false,
    valor_pago: 0,
    valor_pago_acumulado: 0,
    juros_atraso: 0,
    saldo_restante: Number(valorParcela || 0),
    pago_em: null,
    ...(uid ? { user_id: uid } : {}),
  }));

  const { error: insErr } = await supabase
    .from("parcelas")
    .upsert(parcelasRows, { onConflict: "emprestimo_id,numero", ignoreDuplicates: true });
  if (insErr) throw insErr;

  const novoPayload = {
    ...payload,
    dataContrato: dataBaseISO,
    data_contrato: dataBaseISO,
    prazoDias: prazoDiasOriginal,
    prazo_dias: prazoDiasOriginal,
    primeiraParcela: vencimentos[0] ?? primeiraParcelaAjustada,
    primeira_parcela: vencimentos[0] ?? primeiraParcelaAjustada,
    vencimentos,
    parcelas: numeroParcelas,
    numeroParcelas: numeroParcelas,
    valorParcela: Number(valorParcela || 0),
    valor_parcela: Number(valorParcela || 0),
    totalReceber: Number(totalReceber || 0),
    total_receber: Number(totalReceber || 0),
  };

  const { error: upErr } = await supabase
    .from("emprestimos")
    .update({
      status: "ativo",
      quitado_em: null,
      payload: novoPayload,
    })
    .eq("id", emprestimoId);

  if (upErr) throw upErr;
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

  const modalidadeNorm = normModalidadeCalculos(row.modalidade ?? payload.modalidade ?? row.tipo ?? "parcelado_mensal");

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
    const modalidade = modalidadeNorm as any;
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

  const nomePayload =
    payload.clienteNome ??
    payload.cliente_nome ??
    row?.cliente?.payload?.nomeCompleto ??
    row?.cliente?.payload?.nome ??
    row?.cliente?.nome ??
    row.nome_cliente ??
    row.cliente_name ??
    row.clienteNomeCompleto;
  const nomeRow = row.clienteNome ?? row.cliente_nome;
  const clienteNomeNormalizado =
    String(nomePayload ?? "").trim() ||
    String(nomeRow ?? "").trim() ||
    "Cliente";

  return {
    ...row,

    // cliente
    clienteId: row.clienteId ?? row.cliente_id ?? row.cliente ?? row.clienteID,
    clienteNome: clienteNomeNormalizado,
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
    modalidade: modalidadeNorm,
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
      cliente:clientes(
            id,
            nome,
            payload
          ),
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

  __rt_channel = supabase
    .channel(`rt-emprestimos-${uid}`)
    // Em multi-tenant, user_id pode ser o tenant_id (owner), não auth.uid() do staff.
    // Deixamos sem filtro e confiamos no RLS para entregar apenas linhas autorizadas.
    .on("postgres_changes", { event: "*", schema: "public", table: "emprestimos" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "parcelas" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, onChange);

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

          // Insere e imediatamente re-carrega as parcelas para não deixar a UI em estado inconsistente
          // (ex.: empréstimo aparece "em dia" porque parcelasDb ainda está vazio).
          const ins = await supabase
            .from("parcelas")
            .upsert(rows, { onConflict: "emprestimo_id,numero", ignoreDuplicates: true });
          if (!ins.error) {
            const sel = await supabase
              .from("parcelas")
              .select(
                "id, emprestimo_id, numero, valor, vencimento, pago, valor_pago, valor_pago_acumulado, juros_atraso, multa_valor, acrescimos, saldo_restante, pago_em, created_at, updated_at"
              )
              .eq("emprestimo_id", e.id)
              .order("numero", { ascending: true });
            if (!sel.error && Array.isArray(sel.data)) {
              (e as any).parcelasDb = sel.data;
            }
          }
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
      const uid = (await supabase.auth.getUser())?.data?.user?.id ?? null;

      // IMPORTANTE:
      // O schema atual do Supabase para `emprestimos` possui colunas enxutas.
      // Tudo que for específico do contrato fica dentro de `payload` (jsonb).
      const insert: any = {
        ...(uid ? { user_id: uid } : {}),
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
          : Array.from({ length: Math.max(1, Number(payload.parcelas ?? 1)) }, () => payload.primeiraParcela || todayYmd());

      const temCronogramaPersonalizado =
        Array.isArray(payload.parcelasPersonalizadas) &&
        payload.parcelasPersonalizadas.length === Math.max(1, Number(payload.parcelas ?? 1));

      const parcelasRows = temCronogramaPersonalizado
        ? (payload.parcelasPersonalizadas as any[]).map((p, i) => {
            const valorPar = Number(p?.valor ?? 0);
            return {
              emprestimo_id: created.id,
              numero: p?.numero ?? i + 1,
              vencimento: p?.vencimento ?? vencs[i] ?? payload.primeiraParcela ?? todayYmd(),
              valor: valorPar,
              pago: false,
              valor_pago_acumulado: 0,
              juros_atraso: 0,
              saldo_restante: valorPar,
              ...(uid ? { user_id: uid } : {}),
            };
          })
        : vencs.map((venc, i) => ({
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

      const { error: parcelasErr } = await supabase
        .from("parcelas")
        .upsert(parcelasRows, { onConflict: "emprestimo_id,numero", ignoreDuplicates: true });
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
            multa_valor,
            acrescimos,
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

      let erroRenovacao: any = null;
      if ((flags as any)?.reiniciar_contrato) {
        try {
          await renovarContratoPreservandoConfiguracao(emprestimoId, dataPagamento || todayYmd());
        } catch (e: any) {
          erroRenovacao = e;
        }
      }

      await get().fetchEmprestimos();
      await get().fetchPagamentos(emprestimoId);

      if (erroRenovacao) {
        throw new Error(
          `Pagamento registrado, mas falhou ao renovar o contrato: ${erroRenovacao?.message ?? "erro desconhecido"}`
        );
      }

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

  atualizarDataPagamento: async ({ emprestimoId, pagamentoId, dataPagamento }) => {
    set({ loading: true, error: null });
    try {
      await atualizarDataPagamentoDb({ pagamentoId, dataPagamento });
      await get().fetchEmprestimos();
      await get().fetchPagamentos(emprestimoId);
      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao atualizar data do pagamento", loading: false });
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

  renovarEmprestimo: async (emprestimoId) => {
    set({ loading: true, error: null });
    try {
      await renovarContratoPreservandoConfiguracao(emprestimoId, todayYmd());
      await get().fetchEmprestimos();
      await get().fetchPagamentos(emprestimoId);
      set({ loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao renovar empréstimo", loading: false });
    }
  },
}));
