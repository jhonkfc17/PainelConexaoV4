import { supabase } from "./supabaseClient";

export function normalizeCommissionPct(value: unknown): number {
  const pct = Number(value);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, pct);
}

export function commissionFactorFromPct(value: unknown): number {
  return normalizeCommissionPct(value) / 100;
}

export async function getStaffCommissionPct(userId?: string | null): Promise<number> {
  if (!userId) return 0;

  const { data, error } = await supabase
    .from("staff_members")
    .select("commission_pct")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeCommissionPct((data as any)?.commission_pct);
}

export function scaleByCommission(value: number, factor: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  if (!(factor >= 0)) return amount;
  return amount * factor;
}

export function parseBrlValue(value: unknown): number {
  const text = String(value ?? "");
  const cleaned = text.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatBrlValue(value: number): string {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function scaleCurrencyDisplay(value: string | number, factor: number): string | number {
  if (typeof value === "number") return value;

  const text = String(value ?? "");
  if (!text.includes("R$")) return value;
  return formatBrlValue(scaleByCommission(parseBrlValue(text), factor));
}
