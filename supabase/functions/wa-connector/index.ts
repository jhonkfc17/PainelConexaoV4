import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Json = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-connector-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

  // Simple health check
  if (req.method === "GET") {
    return json({ ok: true, service: "wa-connector", timestamp: new Date().toISOString() });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const webhookSecret =
    getEnv("WA_WEBHOOK_SECRET") ??
    getEnv("RAILWAY_WA_WEBHOOK_SECRET") ??
    getEnv("RAILWAY_WHATSAPP_WEBHOOK_SECRET");

  if (webhookSecret) {
    const provided =
      req.headers.get("x-connector-secret") ||
      req.headers.get("X-Connector-Secret") ||
      new URL(req.url).searchParams.get("secret");

    if (!provided || provided.trim() !== webhookSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    const payloadText = await req.text();
    let payload: unknown = null;
    try {
      payload = payloadText ? JSON.parse(payloadText) : null;
    } catch {
      payload = payloadText || null;
    }

    // For now we just log the webhook. If you want to persist it,
    // connect your preferred storage here (e.g., Supabase table).
    console.log("[wa-connector] webhook received", payload);

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
