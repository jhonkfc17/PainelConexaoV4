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
    const action = body?.action;

    if (!action) {
      return json({ error: "Missing action" }, 400);
    }

    const resp = await fetch(`${WA_CONNECTOR_URL}/whatsapp/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WA_TOKEN}`,
        "x-wa-token": WA_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    return json(parsed, resp.status);
  } catch (err: any) {
    return json({ error: err.message || String(err) }, 500);
  }
});