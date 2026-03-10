import { supabase } from "@/lib/supabaseClient";

export const USER_SETTINGS_KEYS = [
  "cfg_nome_completo",
  "cfg_whatsapp",
  "cfg_empresa_nome",
  "cfg_pix",
  "cfg_assinatura",
  "cfg_auto_enabled",
  "cfg_auto_time",
  "cfg_auto_vence_hoje",
  "cfg_auto_atraso",
  "cfg_auto_antecipada",
  "cfg_tpl_novo_contrato",
  "cfg_tpl_cobranca_mensal",
  "cfg_tpl_cobranca_semanal",
  "cfg_tpl_atraso_mensal",
  "cfg_tpl_atraso_semanal",
  "cfg_tpl_vence_hoje",
  "cfg_tpl_antecipada",
] as const;

export type UserSettingsMap = Partial<Record<(typeof USER_SETTINGS_KEYS)[number], string>>;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function readManagedSettingsFromLocalStorage(): UserSettingsMap {
  const payload: UserSettingsMap = {};
  for (const key of USER_SETTINGS_KEYS) {
    const value = lsGet(key);
    if (value != null) payload[key] = value;
  }
  return payload;
}

export function applyUserSettingsToLocalStorage(payload: UserSettingsMap | null | undefined) {
  if (!payload) return;
  for (const key of USER_SETTINGS_KEYS) {
    const value = payload[key];
    if (typeof value === "string") lsSet(key, value);
  }
}

export function clearManagedSettingsFromLocalStorage() {
  for (const key of USER_SETTINGS_KEYS) {
    lsRemove(key);
  }
}

export async function loadMyUserSettings(): Promise<UserSettingsMap> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("payload")
    .maybeSingle();

  if (error) throw error;
  return ((data as any)?.payload ?? {}) as UserSettingsMap;
}

export async function saveMyUserSettings(payload: UserSettingsMap): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Usuário não autenticado.");

  const tenantId =
    String((user as any)?.app_metadata?.tenant_id ?? (user as any)?.user_metadata?.tenant_id ?? user.id ?? "") || "";

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      {
        auth_user_id: user.id,
        tenant_id: tenantId,
        payload,
      },
      { onConflict: "auth_user_id" }
    );

  if (error) throw error;
}

export async function hydrateMyUserSettingsToLocalStorage(): Promise<UserSettingsMap> {
  const payload = await loadMyUserSettings();
  applyUserSettingsToLocalStorage(payload);
  return payload;
}
