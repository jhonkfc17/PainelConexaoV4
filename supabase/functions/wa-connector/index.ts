import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Json = Record<string, any>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: Json, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeToWhatsAppBR(raw: string) {
  const digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

async function readJson(req: Request) {
  try {
    return (await req.json()) as Json;
  } catch {
    return {};
  }
}

/**
 * Envia mensagem de texto via WhatsApp Cloud API.
 * Importante:
 * - Para iniciar conversa fora da janela de 24h, você precisa usar TEMPLATE (message templates).
 * - Texto simples funciona quando o cliente já conversou recentemente (janela de atendimento).
 */
async function waCloudSendText(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  message: string;
}) {
  const { phoneNumberId, accessToken, to, message } = opts;

  const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: data?.error?.message || "Erro ao enviar mensagem",
      details: data,
    };
  }

  return {
    ok: true,
    data,
    messageId: data?.messages?.[0]?.id ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Auth do Supabase (mantém sua regra: tenant_id = user.id)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

    // WhatsApp Cloud API
    const WA_PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID") || "";
    const WA_ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    if (!WA_PHONE_NUMBER_ID || !WA_ACCESS_TOKEN) {
      return json({ error: "Missing WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN" }, 500);
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization Bearer token" }, 401);

    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Missing bearer token" }, 401);

    // Valida token do usuário
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    const caller = userRes?.user ?? null;

    if (userErr || !caller?.id) {
      return json({ error: "Unauthorized", details: userErr?.message ?? "Invalid token" }, 401);
    }

    // 1 usuário = 1 "tenant"
    const tenant_id = caller.id;

    const body = await readJson(req);
    const action = String(body?.action ?? "").trim();
    if (!action) return json({ error: "Missing action" }, 400);

    // Cloud API não tem QR / sessão local como WhatsApp Web.
    // Mantemos essas ações apenas para o painel não quebrar.
    if (action === "init") {
      return json({
        ok: true,
        tenant_id,
        status: "ready",
        connected: true,
        note: "Cloud API: não requer QR. Número é gerenciado na Meta.",
      });
    }

    if (action === "status") {
      // Para Cloud API, consideramos "ready" se as variáveis existem.
      // Se quiser mais forte: dá pra fazer um call de teste no Graph (ex.: phone_number).
      return json({
        ok: true,
        tenant_id,
        status: "ready",
        connected: true,
        connectedNumber: null,
        qrUpdatedAt: null,
        lastError: null,
        lastSeenAt: new Date().toISOString(),
        note: "Cloud API: status é lógico (sem sessão Web).",
      });
    }

    if (action === "qr") {
      // Não existe QR na Cloud API
      return json({
        ok: true,
        tenant_id,
        hasQr: false,
        status: "ready",
        qr: undefined,
        qrUpdatedAt: null,
        note: "Cloud API: não existe QR.",
      });
    }

    if (action === "send") {
      const to = normalizeToWhatsAppBR(String(body?.to ?? "").trim());
      const message = String(body?.message ?? "").trim();
      if (!to || !message) return json({ error: "to and message required" }, 400);

      const r = await waCloudSendText({
        phoneNumberId: WA_PHONE_NUMBER_ID,
        accessToken: WA_ACCESS_TOKEN,
        to,
        message,
      });

      if (!r.ok) {
        // Importante: não devolve "ok:true" nunca aqui
        // Se cair em "fora da janela 24h" a Meta devolve erro informando template necessário.
        return json(
          {
            ok: false,
            tenant_id,
            error: r.error,
            status: r.status,
            details: r.details,
            hint:
              "Se o cliente não falou com você nas últimas 24h, você precisa enviar TEMPLATE aprovado (message templates).",
          },
          r.status || 502
        );
      }

      return json({
        ok: true,
        tenant_id,
        messageId: r.messageId,
        raw: r.data,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});