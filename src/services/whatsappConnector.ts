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
  lastError?: string | null;
  [k: string]: any;
};

export type WaInitResponse = {
  ok: boolean;
  tenant_id?: string;
  status?: WaStatus;
  lastError?: string | null;
  [k: string]: any;
};

export type WaSendResponse = {
  ok: boolean;
  warning?: string;
  lastError?: string | null;
  [k: string]: any;
};

function isPuppeteerNoise(msg: string | null | undefined) {
  const m = String(msg ?? "").toLowerCase();
  return (
    m.includes("runtime.callfunctionon timed out") ||
    m.includes("protocoltimeout") ||
    m.includes("execution context was destroyed") ||
    m.includes("most likely because of a navigation")
  );
}

/**
 * Normaliza respostas para não quebrar a UX:
 * - Se estiver conectado, não propaga lastError de Puppeteer.
 * - Se vier ok:false mas o status/waState indicar conectado, converte pra ok:true/ready.
 */
function normalizeStatusResponse(r: WaStatusResponse): WaStatusResponse {
  const statusRaw = String(r?.status ?? "").toLowerCase();
  const waStateRaw = String((r as any)?.waState ?? "").toUpperCase();
  const connectedByState = r?.connected === true || statusRaw === "ready" || waStateRaw === "CONNECTED";

  // Se está conectado, limpa ruído
  if (connectedByState) {
    return {
      ...r,
      ok: true,
      status: "ready",
      connected: true,
      lastError: null,
    };
  }

  // Se NÃO está conectado, mantém como veio
  return r;
}

function normalizeGeneric<T extends Record<string, any>>(r: T): T {
  // Se vier algum lastError com ruído e o backend já mandou warning/connected, não deixe sujar a UI
  const connected = Boolean((r as any)?.connected);
  const statusRaw = String((r as any)?.status ?? "").toLowerCase();
  const waStateRaw = String((r as any)?.waState ?? "").toUpperCase();
  const connectedByState = connected || statusRaw === "ready" || waStateRaw === "CONNECTED";

  if (connectedByState && isPuppeteerNoise((r as any)?.lastError)) {
    return { ...r, lastError: null } as T;
  }
  return r;
}

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
    const message = (error as any)?.message ?? "Erro ao chamar wa-connector";
    throw new Error(message);
  }

  // Normalizações por action
  if (action === "status") {
    return normalizeStatusResponse(data as WaStatusResponse) as any as T;
  }

  // Para as outras actions, limpa ruído se estiver conectado
  return normalizeGeneric(data as any) as T;
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