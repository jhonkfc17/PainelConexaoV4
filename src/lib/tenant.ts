import { supabase } from "./supabaseClient";

/**
 * Retorna o usuário autenticado atual
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

/**
 * Extrai tenant_id e role do token (app_metadata/user_metadata).
 * Fallback para user.id (modo single-tenant / owner).
 */
function extractTenant(user: any): { tenantId: string | null; role: string | null } {
  const appMeta = (user?.app_metadata ?? {}) as any;
  const userMeta = (user?.user_metadata ?? {}) as any;

  const tenantId = String(appMeta.tenant_id ?? userMeta.tenant_id ?? user?.id ?? "") || null;
  const role = String(appMeta.role ?? userMeta.role ?? (user ? "owner" : "")) || null;

  return { tenantId, role };
}

/**
 * Retorna o tenant_id atual.
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const user = await getCurrentUser();
  const { tenantId } = extractTenant(user);
  return tenantId;
}

/**
 * Retorna o role atual (do token), se existir.
 */
export async function getCurrentRole(): Promise<string | null> {
  const user = await getCurrentUser();
  const { role } = extractTenant(user);
  return role;
}

/**
 * Busca o role do usuário na tabela staff_members.
 * IMPORTANTE: filtra por tenant_id + auth_user_id para não dar 406 (single com várias linhas).
 */
async function getStaffRoleForCurrentUser(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { tenantId } = extractTenant(user);
  if (!tenantId) return null;

  const { data, error } = await supabase
    .from("staff_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Não quebra a UI por falha de role; apenas loga para debug
    console.warn("[tenant] Falha ao buscar staff role:", error);
    return null;
  }

  return (data as any)?.role ?? null;
}

/**
 * Verifica se usuário é ADMIN
 */
export async function isAdminUser(): Promise<boolean> {
  // Primeiro tenta role do token
  const role = await getCurrentRole();
  if (role === "admin") return true;
  if (role === "owner") return true;

  // Depois tenta staff_members
  const staffRole = await getStaffRoleForCurrentUser();
  return staffRole === "admin" || staffRole === "owner";
}

/**
 * Verifica se usuário é STAFF (admin ou staff)
 */
export async function isStaffUser(): Promise<boolean> {
  const role = await getCurrentRole();
  if (role === "admin" || role === "staff" || role === "owner") return true;

  const staffRole = await getStaffRoleForCurrentUser();
  return staffRole === "admin" || staffRole === "staff" || staffRole === "owner";
}

/**
 * Verifica se usuário é DONO (OWNER)
 */
export async function isOwnerUser(): Promise<boolean> {
  const role = await getCurrentRole();
  if (role === "owner") return true;

  const staffRole = await getStaffRoleForCurrentUser();
  return staffRole === "owner";
}
