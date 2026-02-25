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

function isProtocolTimeoutError(message: string | null | undefined) {
  const m = String(message ?? "").toLowerCase();
  return m.includes("runtime.callfunctionon timed out") || m.includes("protocoltimeout");
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeToWhatsAppBR(raw: string) {
  const digits = onlyDigits(raw);
  if (!digits) return "";

  // Ja veio com DDI 55
  if (digits.startsWith("55")) return digits;

  // Formato nacional com DDD (10 ou 11 digitos): prefixa 55
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

async function forward(
  baseUrl: string,
  token: string,
  path: string,
  method: string,
  body?: any
) {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    // alguns conectores usam x-wa-token (novo)
    "x-wa-token": token,
    // outros usam Authorization Bearer (legado)
    Authorization: `Bearer ${token}`,
  };

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: data?.error ?? text ?? resp.statusText, data };
  }

  return { ok: true, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Supabase reserva prefixo SUPABASE_* na UI; deixe cair para SERVICE_ROLE_KEY se for o que estiver setado.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    const WA_CONNECTOR_URL = Deno.env.get("WA_CONNECTOR_URL")!;
    const WA_TOKEN = Deno.env.get("WA_TOKEN")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    if (!WA_CONNECTOR_URL || !WA_TOKEN) return json({ error: "Missing WA_CONNECTOR_URL / WA_TOKEN" }, 500);

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization Bearer token" }, 401);

    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Missing bearer token" }, 401);

    // client "user" (valida token) usando service role, mas com Authorization do usuário.
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    const caller = userRes?.user ?? null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // resolve tenant
    const tenantIdFromToken = caller ? (caller.app_metadata as any)?.tenant_id ?? null : null;
    const tenantId = tenantIdFromToken ?? (caller ? caller.id : String((await readJson(req))?.tenant_id ?? ""));

    if (!tenantId) {
      // Se não conseguiu resolver tenant e não há caller, rejeita.
      if (userErr || !caller) return json({ error: "Unauthorized", details: userErr?.message ?? "Invalid token" }, 401);
    }

    // staff: exige ativo (e opcionalmente role admin para ações destrutivas)
    if (tenantIdFromToken && caller) {
      const { data: staffRow, error: staffErr } = await admin
        .from("staff_members")
        .select("role, active")
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", caller.id)
        .maybeSingle();

      if (staffErr) return json({ error: "staff lookup failed", details: staffErr.message }, 500);
      if (!staffRow?.active) return json({ error: "Forbidden", details: "Caller is not active" }, 403);
    }

    const body = await readJson(req);
    const action = String(body?.action ?? "").trim();
    const tenant_id = String(body?.tenant_id ?? tenantId).trim();

    // nunca permitir operar outro tenant
    if (tenant_id !== tenantId) return json({ error: "Forbidden", details: "tenant mismatch" }, 403);

    if (!action) return json({ error: "Missing action" }, 400);

    if (action === "init") {
      const r = await forward(WA_CONNECTOR_URL, WA_TOKEN, "/whatsapp/init", "POST", { tenant_id });
      return json(r.ok ? { ok: true, tenant_id, ...r.data } : { ok: false, tenant_id, ...r }, r.ok ? 200 : 502);
    }

    if (action === "status") {
      const r = await forward(WA_CONNECTOR_URL, WA_TOKEN, `/whatsapp/status?tenant_id=${encodeURIComponent(tenant_id)}`, "GET");
      if (!r.ok) {
        // Alguns conectores retornam timeout do Puppeteer mesmo com sessao conectada.
        // Nesses casos, convertemos para "ready" para nao quebrar a UX.
        const msg = String((r as any)?.error ?? "");
        const statusRaw = String((r as any)?.data?.status ?? "").toLowerCase();
        const waStateRaw = String((r as any)?.data?.waState ?? "").toUpperCase();
        const connectedByState = statusRaw === "ready" || waStateRaw === "CONNECTED";

        if (isProtocolTimeoutError(msg) && connectedByState) {
          return json({
            ok: true,
            tenant_id,
            status: "ready",
            connected: true,
            connectedNumber: null,
            qrUpdatedAt: null,
            lastError: msg,
            lastSeenAt: new Date().toISOString(),
          });
        }

        return json({ ok: false, tenant_id, ...r }, 502);
      }

      const status = (r.data?.status ?? "idle") as any;
      return json({
        ok: true,
        tenant_id,
        status,
        connected: status === "ready",
        connectedNumber: null,
        qrUpdatedAt: null,
        lastError: r.data?.lastError ?? null,
        lastSeenAt: r.data?.lastEventAt ? new Date(r.data.lastEventAt).toISOString() : null,
      });
    }

    if (action === "qr") {
      const r = await forward(WA_CONNECTOR_URL, WA_TOKEN, `/whatsapp/qr?tenant_id=${encodeURIComponent(tenant_id)}`, "GET");
      if (!r.ok) {
        const msg = String((r as any)?.error ?? "");
        const statusRaw = String((r as any)?.data?.status ?? "").toLowerCase();
        const waStateRaw = String((r as any)?.data?.waState ?? "").toUpperCase();
        const connectedByState = statusRaw === "ready" || waStateRaw === "CONNECTED";

        // Se a sessao esta conectada, timeout ao pedir QR nao deve virar erro fatal.
        if (isProtocolTimeoutError(msg) && connectedByState) {
          return json({
            ok: true,
            tenant_id,
            hasQr: false,
            status: "ready",
            qr: undefined,
            qrUpdatedAt: null,
          });
        }

        return json({ ok: false, tenant_id, ...r }, 502);
      }

      const qr = r.data?.qr ?? null;
      return json({
        ok: true,
        tenant_id,
        hasQr: Boolean(qr),
        status: qr ? "qr" : "idle",
        qr: qr || undefined,
      });
    }

    if (action === "send") {
      const to = normalizeToWhatsAppBR(String(body?.to ?? "").trim());
      const message = String(body?.message ?? "").trim();
      if (!to || !message) return json({ error: "to and message required" }, 400);

      const r = await forward(WA_CONNECTOR_URL, WA_TOKEN, "/whatsapp/send", "POST", { tenant_id, to, message });
      if (!r.ok) {
        const status = typeof r.status === "number" && r.status >= 400 && r.status < 500 ? r.status : 502;
        return json({ ok: false, ...r }, status);
      }

      return json({ ok: true, ...r.data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
