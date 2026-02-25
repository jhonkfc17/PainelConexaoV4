// src/services/whatsappConnector.ts
import { supabase } from "@/lib/supabaseClient";

type EdgeError = {
  message?: string;
  context?: { body?: unknown; status?: number };
};

async function extractEdgeErrorDetails(error: EdgeError): Promise<string> {
  const body = (error as any)?.context?.body;

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed?.error || parsed?.message || parsed?.details || body;
    } catch {
      return body;
    }
  }

  if (body && typeof body === "object") {
    return (
      (body as any)?.error ||
      (body as any)?.message ||
      (body as any)?.details ||
      JSON.stringify(body)
    );
  }

  return (error as any)?.message || "Erro ao chamar WhatsApp Connector";
}

async function invokeWa(body: Record<string, unknown>) {
  const { data: sess, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;

  const token = sess.session?.access_token;
  if (!token) throw new Error("Sessão inválida. Faça login novamente.");

  const { data, error } = await supabase.functions.invoke("wa-connector", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  });

  if (error) {
    const msg = await extractEdgeErrorDetails(error as EdgeError);
    console.error("[wa-connector] error details:", error);
    throw new Error(msg);
  }

  return data as any;
}

export type WaStatusResult = {
  status: string;
  connectedNumber: string | null;
  lastError: string | null;
};

export async function waInit() {
  const res = await invokeWa({ action: "init" });
  if (res?.ok === false) {
    throw new Error(res?.error || `Falha ao iniciar (status ${res?.status ?? "desconhecido"})`);
  }
  return res;
}

export async function waStatus(): Promise<WaStatusResult> {
  const res = await invokeWa({ action: "status" });

  if (res?.ok === false) {
    throw new Error(res?.error || `Erro ao obter status (HTTP ${res?.status ?? "desconhecido"})`);
  }

  return {
    status: res?.status ?? "idle",
    connectedNumber: res?.connectedNumber ?? null,
    lastError: res?.lastError ?? null,
  };
}

export type WaQrResult = {
  hasQr: boolean;
  qr: string | null;
  status: string;
};

export async function waQr(): Promise<WaQrResult> {
  const res = await invokeWa({ action: "qr" });

  if (res?.ok === false) {
    throw new Error(res?.error || `Erro ao obter QR (HTTP ${res?.status ?? "desconhecido"})`);
  }

  return {
    hasQr: Boolean(res?.hasQr ?? res?.qr),
    qr: res?.qr ?? null,
    status: res?.status ?? "idle",
  };
}

export async function waSend(to: string, message: string) {
  const res = await invokeWa({ action: "send", to, message });

  if (res?.ok === false) {
    throw new Error(res?.error || `Erro ao enviar (HTTP ${res?.status ?? "desconhecido"})`);
  }

  return res;
}
