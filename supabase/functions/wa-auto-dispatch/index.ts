import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const WA_CONNECTOR_URL = Deno.env.get("WA_CONNECTOR_URL")!;
const WA_TOKEN = Deno.env.get("WA_TOKEN")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wa-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const tenantId = body?.tenant_id;
    const items = body?.items;

    if (!tenantId || !Array.isArray(items)) {
      return json({ error: "Invalid payload" }, 400);
    }

    const resp = await fetch(`${WA_CONNECTOR_URL}/whatsapp/send-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wa-token": WA_TOKEN,
        Authorization: `Bearer ${WA_TOKEN}`,
      },
      body: JSON.stringify({ tenant_id: tenantId, items }),
    });

    const result = await resp.json();
    return json(result, resp.status);
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 500);
  }
});