import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown>;

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

function getEnv(name: string): string | null {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const connectorUrl =
    getEnv("WA_CONNECTOR_URL") ?? getEnv("RAILWAY_WA_URL") ?? getEnv("RAILWAY_WHATSAPP_URL");
  const connectorToken =
    getEnv("WA_CONNECTOR_TOKEN") ??
    getEnv("RAILWAY_WA_TOKEN") ??
    getEnv("RAILWAY_WHATSAPP_TOKEN");

  if (!connectorUrl || !connectorToken) {
    return json(
      {
        error: "Missing connector configuration",
        details: "Set WA_CONNECTOR_URL / WA_CONNECTOR_TOKEN (or RAILWAY_WA_URL / RAILWAY_WA_TOKEN)",
      },
      500
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const to = String(body?.to ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const tenant_id = body?.tenant_id ? String(body.tenant_id) : undefined;
    const media_url = body?.media_url ? String(body.media_url) : undefined;

    if (!to) return json({ error: "Missing 'to' phone number" }, 400);
    if (!message) return json({ error: "Missing 'message' text" }, 400);

    const payload: Record<string, string> = { to, message };
    if (tenant_id) payload.tenant_id = tenant_id;
    if (media_url) payload.media_url = media_url;

    const response = await fetch(`${connectorUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connectorToken}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text || null;
    }

    if (!response.ok) {
      return json(
        {
          error: "connector_request_failed",
          status: response.status,
          details: parsed,
        },
        response.status === 401 || response.status === 403 ? response.status : 502
      );
    }

    return json({
      ok: true,
      connector_status: response.status,
      connector_response: parsed,
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
