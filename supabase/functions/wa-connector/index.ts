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
 * Envia texto via Cloud API
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
      error: data?.error?.message ?? "Erro ao enviar mensagem",
      details: data,
    };
  }

  return { ok: true, data, messageId: data?.messages?.[0]?.id ?? null };
}

/**
 * Envia template via Cloud API
 * templateParams: array de strings que serão usadas como parâmetros do componente "body"
 */
async function waCloudSendTemplate(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  templateLang: string;
  templateParams?: string[];
}) {
  const { phoneNumberId, accessToken, to, templateName, templateLang, templateParams = [] } = opts;

  // monta o payload de componentes para o body do template
  const bodyParams = templateParams.map((p) => ({ type: "text", text: p }));

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [],
    },
  };

  if (bodyParams.length > 0) {
    payload.template.components.push({ type: "body", parameters: bodyParams });
  }

  const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: data?.error?.message ?? "Erro ao enviar template",
      details: data,
    };
  }

  return { ok: true, data, messageId: data?.messages?.[0]?.id ?? null };
}

/**
 * Decide se a falha exige fallback para template
 */
function shouldUseTemplateFallback(r: any) {
  if (!r) return false;
  const status = Number(r?.status ?? 0);
  const msg = String((r?.error ?? "") || (r?.details?.error?.message ?? "")).toLowerCase();

  // condições comuns: mensagem diz "template" / "outside the 24" / "window" / "template required"
  if (msg.includes("template") || msg.includes("outside the 24") || msg.includes("24h") || msg.includes("window") || msg.includes("template required")) {
    return true;
  }

  // alguns códigos 400/403/428 podem significar que é necessário template (Glance)
  if (status === 400 || status === 403 || status === 428 || status === 422) return true;

  return false;
}

/**
 * Handler
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Supabase + Cloud API envs
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

    const WA_PHONE_NUMBER_ID = Deno.env.get("WA_PHONE_NUMBER_ID") || "";
    const WA_ACCESS_TOKEN = Deno.env.get("WA_ACCESS_TOKEN") || "";

    // Optional: default template envs to use as fallback
    const WA_TEMPLATE_NAME = Deno.env.get("WA_TEMPLATE_NAME") || ""; // ex: hello_world
    const WA_TEMPLATE_LANG = Deno.env.get("WA_TEMPLATE_LANG") || "pt_BR"; // ex: pt_BR

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

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    const caller = userRes?.user ?? null;
    if (userErr || !caller?.id) {
      return json({ error: "Unauthorized", details: userErr?.message ?? "Invalid token" }, 401);
    }

    const tenant_id = caller.id;
    const body = await readJson(req);
    const action = String(body?.action ?? "").trim();
    if (!action) return json({ error: "Missing action" }, 400);

    // Keep init/status/qr for UI compatibility
    if (action === "init") {
      return json({
        ok: true,
        tenant_id,
        status: "ready",
        connected: true,
        note: "Cloud API: no QR required.",
      });
    }

    if (action === "status") {
      return json({
        ok: true,
        tenant_id,
        status: "ready",
        connected: true,
        lastError: null,
        lastSeenAt: new Date().toISOString(),
      });
    }

    if (action === "qr") {
      return json({
        ok: true,
        tenant_id,
        hasQr: false,
        status: "ready",
        qr: undefined,
        note: "Cloud API: no QR.",
      });
    }

    if (action === "send") {
      const to = normalizeToWhatsAppBR(String(body?.to ?? "").trim());
      const message = String(body?.message ?? "").trim();
      const templateParams: string[] = Array.isArray(body?.template_params) ? body.template_params : [];

      if (!to || !message) return json({ error: "to and message required" }, 400);

      // 1) tenta texto simples
      const rText = await waCloudSendText({
        phoneNumberId: WA_PHONE_NUMBER_ID,
        accessToken: WA_ACCESS_TOKEN,
        to,
        message,
      });

      if (rText.ok) {
        return json({ ok: true, tenant_id, messageId: rText.messageId, raw: rText.data });
      }

      // 2) se falhou por motivo comum (fora da janela 24h / template required), tenta fallback para template
      if (shouldUseTemplateFallback(rText)) {
        // template name/lang: prioridade para body.template_name/template_lang, senão envs
        const templateName = String(body?.template_name ?? WA_TEMPLATE_NAME || "").trim();
        const templateLang = String(body?.template_lang ?? WA_TEMPLATE_LANG || "pt_BR").trim();

        if (!templateName) {
          // não há template configurado → retorna erro com hint
          return json({
            ok: false,
            tenant_id,
            error: "Template required but no template configured.",
            details: rText,
            hint: "Configure WA_TEMPLATE_NAME/WA_TEMPLATE_LANG or send template_name/template_lang in body",
            retryable: false,
          }, rText.status || 502);
        }

        // Se não vier templateParams pelo body, por padrão passamos a própria mensagem como {{1}}
        const paramsToUse = templateParams.length > 0 ? templateParams : [message];

        const rTpl = await waCloudSendTemplate({
          phoneNumberId: WA_PHONE_NUMBER_ID,
          accessToken: WA_ACCESS_TOKEN,
          to,
          templateName,
          templateLang,
          templateParams: paramsToUse,
        });

        if (rTpl.ok) {
          return json({ ok: true, tenant_id, messageId: rTpl.messageId, raw: rTpl.data, usedTemplate: templateName });
        }

        // fallback template também falhou
        return json({
          ok: false,
          tenant_id,
          error: rTpl.error || "Failed to send template",
          details: { textError: rText, templateError: rTpl },
        }, rTpl.status || 502);
      }

      // 3) Caso geral: retorna o erro original do texto
      return json({
        ok: false,
        tenant_id,
        error: rText.error,
        status: rText.status,
        details: rText.details,
      }, rText.status || 502);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});