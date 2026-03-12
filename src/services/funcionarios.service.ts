import { supabase } from "../lib/supabaseClient";

export type StaffRole = "staff" | "admin";

export type StaffMember = {
  id: string;
  tenant_id: string;
  auth_user_id: string;
  nome: string | null;
  email: string;
  role: StaffRole;
  permissions: Record<string, boolean>;
  commission_pct: number;
  active: boolean;
  created_at: string;
};

export type StaffPayload = {
  action: "list" | "create" | "update" | "disable" | "delete" | "reset_password";
  auth_user_id?: string;
  nome?: string;
  email?: string;
  password?: string;
  role?: StaffRole;
  permissions?: Record<string, boolean>;
  commission_pct?: number;
  active?: boolean;
};

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

function parseEdgeResponse(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function staffAdmin(payload: StaffPayload) {
  const { data, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;

  const token = data.session?.access_token;
  if (!token) throw new Error("Sessao invalida. Faca login novamente.");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Configuracao do Supabase ausente para chamar staff-admin.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/staff-admin`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  const parsed = parseEdgeResponse(rawText);

  if (!response.ok) {
    const msg =
      (parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed.error || parsed.message || parsed.details
        : null) ||
      (typeof parsed === "string" ? parsed : null) ||
      `Edge Function returned ${response.status}`;

    console.error("[staff-admin] error details:", parsed ?? rawText);
    throw new Error(String(msg));
  }

  return parsed;
}

export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from("staff_members")
    .select(
      "id, tenant_id, auth_user_id, nome, email, role, permissions, commission_pct, active, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

export async function createStaff(input: {
  nome: string;
  email: string;
  password: string;
  role?: StaffRole;
  permissions?: Record<string, boolean>;
  commission_pct?: number;
}) {
  return staffAdmin({
    action: "create",
    nome: input.nome,
    email: input.email,
    password: input.password,
    role: input.role ?? "staff",
    permissions: input.permissions ?? {},
    commission_pct: input.commission_pct ?? 0,
  });
}

export async function updateStaff(input: {
  auth_user_id: string;
  nome?: string;
  role?: StaffRole;
  permissions?: Record<string, boolean>;
  commission_pct?: number;
  active?: boolean;
}) {
  return staffAdmin({
    action: "update",
    auth_user_id: input.auth_user_id,
    ...(input.nome !== undefined ? { nome: input.nome } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
    ...(input.commission_pct !== undefined ? { commission_pct: input.commission_pct } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  });
}

export async function deactivateStaff(auth_user_id: string) {
  return staffAdmin({ action: "disable", auth_user_id });
}

export async function deleteStaff(auth_user_id: string) {
  return staffAdmin({ action: "delete", auth_user_id });
}

export async function deleteStaffRow(auth_user_id: string) {
  const { error } = await supabase
    .from("staff_members")
    .delete()
    .eq("auth_user_id", auth_user_id);

  if (error) throw error;
}

export async function resetStaffPassword(auth_user_id: string, password: string) {
  return staffAdmin({ action: "reset_password", auth_user_id, password });
}
