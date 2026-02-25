import { supabase } from "../lib/supabaseClient";

export type SendWhatsAppPayload = {
  tenant_id: string;
  to: string;
  message: string;
  media_url?: string;
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

export async function sendWhatsAppFromPanel(payload: SendWhatsAppPayload) {
  const { data, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw sessErr;

  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão inválida. Faça login novamente.");

  const { data: resp, error } = await supabase.functions.invoke("wa-auto-dispatch", {
    headers: { Authorization: `Bearer ${token}` },
    body: payload,
  });

  if (error) {
    const msg = await extractEdgeErrorDetails(error);
    console.error("[wa-auto-dispatch] error details:", error);
    throw new Error(msg);
  }

  return resp;
}
