// src/services/clientes.service.ts
import { supabase } from "@/lib/supabaseClient";
import type { Cliente, TipoCliente } from "@/components/clientes/clienteTipos";

type ClienteRow = {
  id: string;
  nome?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  payload?: any;
  created_at?: string | null;
  updated_at?: string | null;
};

async function getPrincipalUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function applyPrincipalClienteScope<T>(query: T, userId: string): T {
  return (query as any).or(`created_by.eq.${userId},and(created_by.is.null,user_id.eq.${userId})`) as T;
}

function normalizeTipoCliente(v: any): TipoCliente {
  if (v === "emprestimo" || v === "produto" || v === "geral") return v;
  return "geral";
}

function mapRowToCliente(row: ClienteRow): Cliente {
  const p = row.payload ?? {};
  const createdAt =
    row.created_at ??
    p.createdAt ??
    p.created_at ??
    new Date().toISOString();

  return {
    id: row.id,

    // campos principais (compatível com seu schema atual)
    nomeCompleto: (row.nome ?? p.nomeCompleto ?? p.nome ?? "").toString(),
    cpf: (row.cpf ?? p.cpf ?? undefined) || undefined,
    rg: (p.rg ?? undefined) || undefined,
    email: (row.email ?? p.email ?? undefined) || undefined,
    telefone: (row.telefone ?? p.telefone ?? undefined) || undefined,
    instagram: (p.instagram ?? undefined) || undefined,
    facebook: (p.facebook ?? undefined) || undefined,
    profissao: (p.profissao ?? undefined) || undefined,
    indicacao: (p.indicacao ?? undefined) || undefined,

    tipoCliente: normalizeTipoCliente(p.tipoCliente ?? p.tipo_cliente),

    // 🔥 importante: se não vier no payload, assume true para não marcar tudo como Inativo
    ativo: typeof p.ativo === "boolean" ? p.ativo : true,

    observacoes: (p.observacoes ?? p.observacao ?? undefined) || undefined,

    endereco: p.endereco ?? undefined,
    documentos: p.documentos ?? undefined,

    fotoDataUrl: (p.fotoDataUrl ?? p.foto_data_url ?? undefined) || undefined,

    createdAt: String(createdAt),
    updatedAt: row.updated_at ?? p.updatedAt ?? p.updated_at ?? undefined,
  };
}

function mapClienteToRow(cliente: Cliente): ClienteRow {
  const now = new Date().toISOString();

  return {
    id: cliente.id,
    nome: cliente.nomeCompleto ?? "",
    cpf: cliente.cpf ?? "",
    telefone: cliente.telefone ?? "",
    email: cliente.email ?? "",

    // guarda tudo no payload para não perder campos do modelo rico
    payload: {
      ...cliente,
      tipoCliente: cliente.tipoCliente ?? "geral",
      ativo: typeof cliente.ativo === "boolean" ? cliente.ativo : true,
      updatedAt: now,
    },

    updated_at: now,
  };
}

export async function listClientes(): Promise<Cliente[]> {
  const userId = await getPrincipalUserId();
  if (!userId) return [];

  let query = supabase
    .from("clientes")
    .select("*")
    .order("created_at", { ascending: false });
  query = applyPrincipalClienteScope(query, userId);
  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as ClienteRow[];
  return rows.map(mapRowToCliente);
}

export async function getClienteById(id: string): Promise<Cliente | null> {
  const userId = await getPrincipalUserId();
  if (!userId) return null;

  let query = supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  query = applyPrincipalClienteScope(query, userId);
  const { data, error } = await query;

  if (error) throw error;
  if (!data) return null;

  return mapRowToCliente(data as ClienteRow);
}

export async function upsertCliente(cliente: Cliente): Promise<Cliente> {
  const userId = await getPrincipalUserId();
  if (!userId) throw new Error("Sessão inválida para salvar cliente.");
  const row = mapClienteToRow(cliente);
  (row as any).user_id = userId;
  (row as any).created_by = userId;

  let query = supabase
    .from("clientes")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  query = applyPrincipalClienteScope(query, userId);
  const { data, error } = await query;

  if (error) throw error;
  return mapRowToCliente(data as ClienteRow);
}

export async function deleteCliente(id: string) {
  const userId = await getPrincipalUserId();
  if (!userId) throw new Error("Sessão inválida para excluir cliente.");
  let query = supabase.from("clientes").delete().eq("id", id);
  query = applyPrincipalClienteScope(query, userId);
  const { error } = await query;
  if (error) throw error;
}
