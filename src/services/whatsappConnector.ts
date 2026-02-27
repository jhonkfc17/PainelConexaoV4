import { supabase } from "../lib/supabaseClient";

export type WaStatus = "idle" | "qr" | "ready" | string;

export type WaStatusResponse = {
  ok: boolean;
  tenant_id?: string;
  status?: WaStatus;
  connected?: boolean;
  connectedNumber?: string | null;
  qrUpdatedAt?: string | null;
  lastError?: string | null;
  lastSeenAt?: string | null;
  // passthrough
  [k: string]: any;
};

export type WaQrResponse = {
  ok: boolean;
  tenant_id?: string;
  hasQr?: boolean;
  status?: WaStatus;
  qr?: string;
  qrUpdatedAt?: string | null;
  [k: string]: any;
};

export type WaInitResponse = {
  ok: boolean;
  tenant_id?: string;
  status?: WaStatus;
  [k: string]: any;
};

export type WaSendResponse = {
  ok: boolean;
  [k: string]: any;
};

async function invokeWa<T = any>(
  action: "init" | "status" | "qr" | "send",
  body: Record<string, any> = {}
): Promise<T> {
  // A Edge Function usa o JWT do usuário (Authorization) para resolver tenant_id = user.id.
  // Portanto, NÃO passamos tenant_id aqui, a não ser que você realmente queira sobrescrever.
  const { data, error } = await supabase.functions.invoke("wa-connector", {
    body: { action, ...body },
  });

  if (error) {
    // Padroniza para virar uma mensagem legível no UI
    const message = (error as any)?.message ?? "Erro ao chamar wa-connector";
    throw new Error(message);
  }

  return data as T;
}

export async function waInit(): Promise<WaInitResponse> {
  return invokeWa<WaInitResponse>("init");
}

export async function waStatus(): Promise<WaStatusResponse> {
  return invokeWa<WaStatusResponse>("status");
}

export async function waQr(): Promise<WaQrResponse> {
  return invokeWa<WaQrResponse>("qr");
}

export async function waSend(to: string, message: string): Promise<WaSendResponse> {
  return invokeWa<WaSendResponse>("send", { to, message });
}
