import { supabase } from "../lib/supabaseClient";

export type StaffWallet = {
  staff_member_id: string;
  staff_auth_user_id: string;
  nome: string | null;
  email: string;
  role: string;
  active: boolean;
  commission_pct: number;
  realized_profit: number;
  commission_profit: number;
  paid_total: number;
  adjustment_total: number;
  available_balance: number;
  payout_count: number;
  last_payout_at: string | null;
};

export type StaffWalletPayout = {
  id: string;
  tenant_id: string;
  staff_member_id: string;
  staff_auth_user_id: string;
  valor: number;
  paid_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  estornado_em: string | null;
  estornado_por: string | null;
  estornado_motivo: string | null;
  comprovante_data_url: string | null;
  comprovante_nome: string | null;
  comprovante_mime_type: string | null;
};

export type StaffWalletAdjustment = {
  id: string;
  tenant_id: string;
  staff_member_id: string;
  staff_auth_user_id: string;
  valor: number;
  applied_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  estornado_em: string | null;
  estornado_por: string | null;
  estornado_motivo: string | null;
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapWallet(row: any): StaffWallet {
  return {
    staff_member_id: String(row?.staff_member_id ?? ""),
    staff_auth_user_id: String(row?.staff_auth_user_id ?? ""),
    nome: row?.nome ? String(row.nome) : null,
    email: String(row?.email ?? ""),
    role: String(row?.staff_role ?? row?.role ?? "staff"),
    active: Boolean(row?.active),
    commission_pct: num(row?.commission_pct),
    realized_profit: num(row?.realized_profit),
    commission_profit: num(row?.commission_profit),
    paid_total: num(row?.paid_total),
    adjustment_total: num(row?.adjustment_total),
    available_balance: num(row?.available_balance),
    payout_count: num(row?.payout_count),
    last_payout_at: row?.last_payout_at ? String(row.last_payout_at) : null,
  };
}

function mapPayout(row: any): StaffWalletPayout {
  return {
    id: String(row?.id ?? ""),
    tenant_id: String(row?.tenant_id ?? ""),
    staff_member_id: String(row?.staff_member_id ?? ""),
    staff_auth_user_id: String(row?.staff_auth_user_id ?? ""),
    valor: num(row?.valor),
    paid_at: String(row?.paid_at ?? ""),
    notes: row?.notes ? String(row.notes) : null,
    created_at: String(row?.created_at ?? ""),
    updated_at: String(row?.updated_at ?? ""),
    created_by: row?.created_by ? String(row.created_by) : null,
    estornado_em: row?.estornado_em ? String(row.estornado_em) : null,
    estornado_por: row?.estornado_por ? String(row.estornado_por) : null,
    estornado_motivo: row?.estornado_motivo ? String(row.estornado_motivo) : null,
    comprovante_data_url: row?.comprovante_data_url ? String(row.comprovante_data_url) : null,
    comprovante_nome: row?.comprovante_nome ? String(row.comprovante_nome) : null,
    comprovante_mime_type: row?.comprovante_mime_type ? String(row.comprovante_mime_type) : null,
  };
}

function mapAdjustment(row: any): StaffWalletAdjustment {
  return {
    id: String(row?.id ?? ""),
    tenant_id: String(row?.tenant_id ?? ""),
    staff_member_id: String(row?.staff_member_id ?? ""),
    staff_auth_user_id: String(row?.staff_auth_user_id ?? ""),
    valor: num(row?.valor),
    applied_at: String(row?.applied_at ?? ""),
    notes: row?.notes ? String(row.notes) : null,
    created_at: String(row?.created_at ?? ""),
    updated_at: String(row?.updated_at ?? ""),
    created_by: row?.created_by ? String(row.created_by) : null,
    estornado_em: row?.estornado_em ? String(row.estornado_em) : null,
    estornado_por: row?.estornado_por ? String(row.estornado_por) : null,
    estornado_motivo: row?.estornado_motivo ? String(row.estornado_motivo) : null,
  };
}

export async function listStaffWallets(): Promise<StaffWallet[]> {
  const { data, error } = await supabase.rpc("get_staff_wallets");
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapWallet);
}

export async function getMyStaffWallet(): Promise<StaffWallet | null> {
  const { data, error } = await supabase.rpc("get_my_staff_wallet");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row ? mapWallet(row) : null;
}

export async function listStaffWalletPayouts(): Promise<StaffWalletPayout[]> {
  const { data, error } = await supabase
    .from("staff_profit_payouts")
    .select(
      "id, tenant_id, staff_member_id, staff_auth_user_id, valor, paid_at, notes, created_at, updated_at, created_by, estornado_em, estornado_por, estornado_motivo, comprovante_data_url, comprovante_nome, comprovante_mime_type"
    )
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map(mapPayout);
}

export async function listMyStaffWalletPayouts(): Promise<StaffWalletPayout[]> {
  const { data, error } = await supabase
    .from("staff_profit_payouts")
    .select(
      "id, tenant_id, staff_member_id, staff_auth_user_id, valor, paid_at, notes, created_at, updated_at, created_by, estornado_em, estornado_por, estornado_motivo, comprovante_data_url, comprovante_nome, comprovante_mime_type"
    )
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map(mapPayout);
}

export async function listStaffWalletAdjustments(): Promise<StaffWalletAdjustment[]> {
  const { data, error } = await supabase
    .from("staff_wallet_adjustments")
    .select(
      "id, tenant_id, staff_member_id, staff_auth_user_id, valor, applied_at, notes, created_at, updated_at, created_by, estornado_em, estornado_por, estornado_motivo"
    )
    .order("applied_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map(mapAdjustment);
}

export async function listMyStaffWalletAdjustments(): Promise<StaffWalletAdjustment[]> {
  const { data, error } = await supabase
    .from("staff_wallet_adjustments")
    .select(
      "id, tenant_id, staff_member_id, staff_auth_user_id, valor, applied_at, notes, created_at, updated_at, created_by, estornado_em, estornado_por, estornado_motivo"
    )
    .order("applied_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map(mapAdjustment);
}

export async function createStaffWalletPayout(input: {
  staff_member_id: string;
  valor: number;
  paid_at: string;
  notes?: string;
  comprovante_data_url?: string | null;
  comprovante_nome?: string | null;
  comprovante_mime_type?: string | null;
}) {
  const payload = {
    staff_member_id: input.staff_member_id,
    valor: num(input.valor),
    paid_at: input.paid_at,
    notes: input.notes?.trim() || null,
    comprovante_data_url: input.comprovante_data_url || null,
    comprovante_nome: input.comprovante_nome || null,
    comprovante_mime_type: input.comprovante_mime_type || null,
  };

  const { data, error } = await supabase.from("staff_profit_payouts").insert(payload).select("*").single();
  if (error) throw error;
  return mapPayout(data);
}

export async function createStaffWalletAdjustment(input: {
  staff_member_id: string;
  valor: number;
  applied_at: string;
  notes?: string;
}) {
  const payload = {
    staff_member_id: input.staff_member_id,
    valor: num(input.valor),
    applied_at: input.applied_at,
    notes: input.notes?.trim() || null,
  };

  const { data, error } = await supabase.from("staff_wallet_adjustments").insert(payload).select("*").single();
  if (error) throw error;
  return mapAdjustment(data);
}

export async function updateStaffWalletPayout(input: {
  id: string;
  staff_member_id: string;
  valor: number;
  paid_at: string;
  notes?: string;
  comprovante_data_url?: string | null;
  comprovante_nome?: string | null;
  comprovante_mime_type?: string | null;
}) {
  const payload = {
    staff_member_id: input.staff_member_id,
    valor: num(input.valor),
    paid_at: input.paid_at,
    notes: input.notes?.trim() || null,
    comprovante_data_url: input.comprovante_data_url || null,
    comprovante_nome: input.comprovante_nome || null,
    comprovante_mime_type: input.comprovante_mime_type || null,
  };

  const { data, error } = await supabase
    .from("staff_profit_payouts")
    .update(payload)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) throw error;
  return mapPayout(data);
}

export async function voidStaffWalletPayout(input: {
  id: string;
  motivo?: string;
}) {
  const payload = {
    estornado_em: new Date().toISOString(),
    estornado_por: (await supabase.auth.getUser()).data.user?.id ?? null,
    estornado_motivo: input.motivo?.trim() || null,
  };

  const { data, error } = await supabase
    .from("staff_profit_payouts")
    .update(payload)
    .eq("id", input.id)
    .is("estornado_em", null)
    .select("*")
    .single();

  if (error) throw error;
  return mapPayout(data);
}

export async function voidStaffWalletAdjustment(input: {
  id: string;
  motivo?: string;
}) {
  const payload = {
    estornado_em: new Date().toISOString(),
    estornado_por: (await supabase.auth.getUser()).data.user?.id ?? null,
    estornado_motivo: input.motivo?.trim() || null,
  };

  const { data, error } = await supabase
    .from("staff_wallet_adjustments")
    .update(payload)
    .eq("id", input.id)
    .is("estornado_em", null)
    .select("*")
    .single();

  if (error) throw error;
  return mapAdjustment(data);
}
