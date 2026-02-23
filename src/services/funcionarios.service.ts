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
  action: "create" | "update" | "disable" | "reset_password";
  auth_user_id?: string;
  nome?: string;
  email?: string;
  password?: string;
  role?: StaffRole;
  permissions?: Record<string, boolean>;
  commission_pct?: number;
  active?: boolean;
};

async function extractEdgeErrorDetails(error: any): Promise<string> {
  const body = error?.context?.body;

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed?.error || parsed?.message || parsed?.details || body;
    } catch {
      return body;
    }
  }

  if (body && typeof body === "object") {
    return body?.error || body?.message || body?.details || JSON.stringify(body);
  }

  return error?.message || "Erro ao chamar Edge Function";
}

export async function staffAdmin(payload: StaffPayload) {
  const { data, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;

  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão inválida. Faça login novamente.");

  const { data: resp, error } = await supabase.functions.invoke("staff-admin", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: payload,
  });

  if (error) {
    const msg = await extractEdgeErrorDetails(error);
    console.error("[staff-admin] error details:", error);
    throw new Error(msg);
  }

  return resp;
}

// ------------------------------
// Helpers usados pela tela
// ------------------------------

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

export async function resetStaffPassword(auth_user_id: string, password: string) {
  return staffAdmin({ action: "reset_password", auth_user_id, password });
}