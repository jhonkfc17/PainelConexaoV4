// src/services/whatsappConnector.ts
import { supabase } from "@/lib/supabaseClient";

/**
 * WhatsApp Connector (SEGURANÇA)
 * - Não usa mais token no front.
 * - Chama Edge Function `wa-connector` que mantém WA_TOKEN e WA_CONNECTOR_URL como secrets.
 *
 * Para compatibilidade local (opcional), se você definir VITE_WA_CONNECTOR_URL + VITE_WA_TOKEN,
 * ainda é possível cair no modo direto.
 */

// Fallback opcional (DEV/local)
const DIRECT_WA_URL =
  (import.meta.env.VITE_WA_CONNECTOR_URL as string) ||
  (import.meta.env.VITE_WA_URL as string) ||
  "";

const DIRECT_WA_TOKEN = (import.meta.env.VITE_WA_TOKEN as string) || "";

type WAStatus = {
  ok: boolean;
  tenant_id: string;
  status: "idle" | "connecting" | "qr" | "ready" | "auth_failure" | "disconnected";
  connected: boolean;
  connectedNumber: string | null;
  qrUpdatedAt: string | null;
  lastError: string | null;
  lastSeenAt: string | null;
};

type WAQr = {
  ok: boolean;
  tenant_id: string;
  hasQr: boolean;
  status: WAStatus["status"];
  qr?: string; // dataUrl
  qrUpdatedAt?: string;
};

function canUseDirect() {
  return Boolean(DIRECT_WA_URL && DIRECT_WA_TOKEN);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${DIRECT_WA_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function readErrorText(r: Response) {
  try {
    const text = await r.text();
    return text || `${r.status} ${r.statusText}`;
  } catch {
    return `${r.status} ${r.statusText}`;
  }
}

async function invokeEdge<T = any>(body: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("wa-connector", { body });
  if (error) throw error;
  return data as T;
}

export async function waInit(tenant_id: string) {
  if (canUseDirect()) {
    const r = await fetch(`${DIRECT_WA_URL}/whatsapp/init`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tenant_id }),
    });
    if (!r.ok) throw new Error(await readErrorText(r));
    return r.json();
  }

  return invokeEdge({ action: "init", tenant_id });
}

export async function waStatus(tenant_id: string): Promise<WAStatus> {
  if (canUseDirect()) {
    const r = await fetch(`${DIRECT_WA_URL}/whatsapp/status?tenant_id=${encodeURIComponent(tenant_id)}`, {
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error(await readErrorText(r));
    const data = (await r.json()) as any;
    const status = (data?.status ?? "idle") as WAStatus["status"];
    return {
      ok: true,
      tenant_id,
      status,
      connected: status === "ready",
      connectedNumber: null,
      qrUpdatedAt: null,
      lastError: data?.lastError ?? null,
      lastSeenAt: data?.lastEventAt ? new Date(data.lastEventAt).toISOString() : null,
    };
  }

  return invokeEdge<WAStatus>({ action: "status", tenant_id });
}

export async function waQr(tenant_id: string): Promise<WAQr> {
  if (canUseDirect()) {
    const r = await fetch(`${DIRECT_WA_URL}/whatsapp/qr?tenant_id=${encodeURIComponent(tenant_id)}`, {
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error(await readErrorText(r));
    const data = (await r.json()) as any;
    const qr = data?.qr ?? null;
    return {
      ok: true,
      tenant_id,
      hasQr: !!qr,
      status: qr ? "qr" : "idle",
      qr: qr || undefined,
    };
  }

  return invokeEdge<WAQr>({ action: "qr", tenant_id });
}

export async function waSend(tenant_id: string, to: string, message: string) {
  if (canUseDirect()) {
    const r = await fetch(`${DIRECT_WA_URL}/whatsapp/send`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tenant_id, to, message }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as any)?.error || JSON.stringify(data) || "send failed");
    return data;
  }

  return invokeEdge({ action: "send", tenant_id, to, message });
}
