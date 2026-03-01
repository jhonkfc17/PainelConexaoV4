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
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

async function readJson(req: Request) {
  try {
    const t = await req.text();
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}

async function readJsonSafe(resp: Response) {
  const t = await resp.text();
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    return { raw: t };
  }
}

async function waCloudPing(opts: { phoneNumberId: string; accessToken: string; apiVersion: string }) {
  const { phoneNumberId, accessToken, apiVersion } = opts;

  // "Ping" leve: busca dados do phone number. Se token/id inválidos -> 4xx
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await readJsonSafe(resp);
  if (!resp.ok) {
    const msg = (data as any)?.error?.message ?? resp.statusText ?? "Falha ao validar Cloud API";
    return { ok: false, status: resp.status, error: msg, details: data };
  }
  return { ok: true, data };
}

async function waCloudSendText(opts: {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  to: string;
  message: string;
}) {
  const { phoneNumberId, accessToken, apiVersion, to, message } = opts;

  const resp = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
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

  const data = await readJsonSafe(resp);
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: (data as any)?.error?.message ?? "Erro ao enviar", details: data };
  }
  return { ok: true, data, messageId: (data as any)?.messages?.[0]?.id ?? null };
}

async function waCloudSendTemplate(opts: {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  to: string;
  templateName: string;
  templateLang: string;
  templateParams?: string[];
}) {
  const { phoneNumberId, accessToken, apiVersion, to, templateName, templateLang, templateParams = [] } = opts;

  const components =
    templateParams.length > 0
      ? [
          {
            type: "body",
            parameters: templateParams.map((t) => ({ type: "text", text: t })),
          },
        ]
      : undefined;

  const resp = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLang },
        ...(components ? { components } : {}),
      },
    }),
  });

  const data = await readJsonSafe(resp);
  if (!resp.ok) {
    return { ok: false, status: resp.status, error: (data as any)?.error?.message ?? "Erro ao enviar template", details: data };
  }
  return { ok: true, data, messageId: (data as any)?.messages?.[0]?.id ?? null };
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

// normaliza pra padrão WhatsApp BR: 55 + DDD + numero
function normalizeBR(phoneRaw: string) {
  const d = onlyDigits(phoneRaw);
  if (!d) return "";
  if (d.startsWith("55")) return d;
  if (d.length >= 10) return "55" + d;
  return d;
}

// heurística: quando Meta bloqueia texto livre (fora da janela), normalmente exige template
function shouldUseTemplateFallback(resp: { ok: boolean; status?: number; details?: any; error?: string }) {
  if (resp.ok) return false;
  const status = Number(resp.status ?? 0);
  const msg = String(resp.error ?? "").toLowerCase();
  const err = resp.details?.error;
  const code = Number(err?.code ?? 0);
  const subcode = Number(err?.error_subcode ?? 0);

  // Mantém robusto sem depender de um único código: combina HTTP + sinais comuns
  if (status === 400 || status === 403) {
    if (msg.includes("template") || msg.includes("outside") || msg.includes("24") || msg.includes("window")) return true;
    if (code === 131047 || subcode === 2494013) return true; // alguns subcódigos comuns (variam por conta)
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

    const WA_PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID") || "";
    const WA_ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") || "";
    const WA_API_VERSION = Deno.env.get("WA_API_VERSION") || "v23.0";

    // fallback opcional (igual auto-dispatch)
    const WA_TEMPLATE_NAME = Deno.env.get("WA_TEMPLATE_NAME") || "hello_world";
    const WA_TEMPLATE_LANG = Deno.env.get("WA_TEMPLATE_LANG") || "pt_BR";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    if (!WA_PHONE_NUMBER_ID || !WA_ACCESS_TOKEN) {
      return json({ ok: false, error: "Missing WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN" }, 500);
    }

    // mantém segurança: exige usuário logado (mesmo padrão do seu frontend)
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);

    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ ok: false, error: "Missing bearer token" }, 401);

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    const caller = userRes?.user ?? null;
    if (userErr || !caller?.id) {
      return json({ ok: false, error: "Unauthorized", details: userErr?.message ?? "Invalid token" }, 401);
    }

    const tenant_id = caller.id; // seu "tenant" real hoje = user_id

    const body = await readJson(req);
    const action = String(body?.action ?? "").trim();
    if (!action) return json({ ok: false, error: "Missing action" }, 400);

    // INIT: não existe handshake na Cloud API, então "init" apenas confirma configuração
    if (action === "init") {
      const ping = await waCloudPing({ phoneNumberId: WA_PHONE_NUMBER_ID, accessToken: WA_ACCESS_TOKEN, apiVersion: WA_API_VERSION });
      if (!ping.ok) {
        return json(
          {
            ok: false,
            tenant_id,
            status: "idle",
            connected: false,
            lastError: ping.error ?? "Cloud API inválida",
            details: ping.details ?? null,
          },
          502
        );
      }

      return json({
        ok: true,
        tenant_id,
        status: "ready",
        connected: true,
        connectedNumber: (ping as any)?.data?.display_phone_number ?? null,
        qrUpdatedAt: null,
        lastError: null,
        lastSeenAt: new Date().toISOString(),
      });
    }

    // STATUS: valida token/phone number id via ping
    if (action === "status") {
      const ping = await waCloudPing({ phoneNumberId: WA_PHONE_NUMBER_ID, accessToken: WA_ACCESS_TOKEN, apiVersion: WA_API_VERSION });
      if (!ping.ok) {
        return json({
          ok: true, // mantém UI funcionando mesmo com erro (evita “quebrar” tela)
          tenant_id,
          status: "idle",
          connected: false,
          connectedNumber: null,
          qrUpdatedAt: null,
          lastError: ping.error ?? "Cloud API inválida",
          lastSeenAt: new Date().toISOString(),
        });
      }

      return json({
        ok: true,
        tenant_id,
        status: "ready",
        connected: true,
        connectedNumber: (ping as any)?.data?.display_phone_number ?? null,
        qrUpdatedAt: null,
        lastError: null,
        lastSeenAt: new Date().toISOString(),
      });
    }

    // QR: Cloud API não usa QR
    if (action === "qr") {
      // retorna sempre sem QR e com status consistente
      return json({
        ok: true,
        tenant_id,
        hasQr: false,
        status: "ready",
        qr: null,
        qrUpdatedAt: null,
        lastError: null,
      });
    }

    // SEND: envia mensagem de texto; fallback template opcional se Meta bloquear fora da janela
    if (action === "send") {
      const toRaw = String(body?.to ?? "").trim();
      const message = String(body?.message ?? "").trim();

      if (!toRaw) return json({ ok: false, error: "Missing 'to'" }, 400);
      if (!message) return json({ ok: false, error: "Missing 'message'" }, 400);

      const to = normalizeBR(toRaw);
      if (!to) return json({ ok: false, error: "Invalid phone number" }, 400);

      const rText = await waCloudSendText({
        phoneNumberId: WA_PHONE_NUMBER_ID,
        accessToken: WA_ACCESS_TOKEN,
        apiVersion: WA_API_VERSION,
        to,
        message,
      });

      if (rText.ok) {
        return json({ ok: true, messageId: rText.messageId ?? null, usedTemplate: null });
      }

      if (shouldUseTemplateFallback(rText)) {
        const rTpl = await waCloudSendTemplate({
          phoneNumberId: WA_PHONE_NUMBER_ID,
          accessToken: WA_ACCESS_TOKEN,
          apiVersion: WA_API_VERSION,
          to,
          templateName: WA_TEMPLATE_NAME,
          templateLang: WA_TEMPLATE_LANG,
          templateParams: [message],
        });

        if (rTpl.ok) {
          return json({
            ok: true,
            warning: "Texto bloqueado fora da janela; enviado via template.",
            usedTemplate: WA_TEMPLATE_NAME,
            messageId: rTpl.messageId ?? null,
          });
        }

        return json(
          {
            ok: false,
            error: rTpl.error ?? "Falha no envio via template",
            details: rTpl.details ?? null,
          },
          502
        );
      }

      return json({ ok: false, error: rText.error ?? "Falha ao enviar", details: rText.details ?? null }, 502);
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, error: "Unhandled error", details: String(e) }, 500);
  }
});
