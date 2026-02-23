import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY"); // ✅ FIX

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json(
        { error: "Missing secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY" },
        500
      );
    }

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization Bearer token" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing bearer token" }, 401);

    // ✅ valida o usuário usando o token do caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return json({ error: "Unauthorized", details: userErr?.message ?? "Invalid token" }, 401);
    }
    const caller = userRes.user;

    // Admin client
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const tenantIdFromToken = (caller.app_metadata as any)?.tenant_id ?? null;
    const tenantId = tenantIdFromToken ?? caller.id;

    if (tenantIdFromToken) {
      const { data: staffRow, error: staffErr } = await admin
        .from("staff_members")
        .select("role, active")
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", caller.id)
        .maybeSingle();

      if (staffErr) return json({ error: "staff lookup failed", details: staffErr.message }, 500);
      if (!staffRow?.active || staffRow.role !== "admin") {
        return json({ error: "Forbidden", details: "Caller is not admin/active" }, 403);
      }
    }

    const body = (await req.json().catch(() => ({}))) as Json;
    const action = String(body?.action || "").trim();
    if (!action) return json({ error: "Missing action" }, 400);

    if (action === "create") {
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const nome = String(body?.nome || "");
      const role = String(body?.role || "staff");
      const permissions = (body?.permissions ?? {}) as Json;
      const commission_pct = Number(body?.commission_pct ?? 0);

      if (!email || !password) return json({ error: "email and password required" }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { tenant_id: tenantId, role, active: true },
      });

      if (createErr) return json({ error: "createUser failed", details: createErr.message }, 400);

      const auth_user_id = created.user?.id;
      if (!auth_user_id) return json({ error: "createUser missing id" }, 500);

      const { error: insErr } = await admin.from("staff_members").insert({
        tenant_id: tenantId,
        auth_user_id,
        nome,
        email,
        role,
        permissions,
        commission_pct,
        active: true,
      });

      if (insErr) return json({ error: "insert staff_members failed", details: insErr.message }, 400);
      return json({ ok: true, auth_user_id });
    }

    if (action === "update") {
      const auth_user_id = String(body?.auth_user_id || "");
      if (!auth_user_id) return json({ error: "auth_user_id required" }, 400);

      const update: any = {};
      if (body?.nome !== undefined) update.nome = String(body.nome);
      if (body?.role !== undefined) update.role = String(body.role);
      if (body?.permissions !== undefined) update.permissions = body.permissions;
      if (body?.commission_pct !== undefined) update.commission_pct = Number(body.commission_pct);
      if (body?.active !== undefined) update.active = Boolean(body.active);

      const { error: updErr } = await admin
        .from("staff_members")
        .update(update)
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", auth_user_id);

      if (updErr) return json({ error: "update staff_members failed", details: updErr.message }, 400);
      return json({ ok: true });
    }

    if (action === "disable") {
      const auth_user_id = String(body?.auth_user_id || "");
      if (!auth_user_id) return json({ error: "auth_user_id required" }, 400);

      const { error: updErr } = await admin
        .from("staff_members")
        .update({ active: false })
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", auth_user_id);

      if (updErr) return json({ error: "disable failed", details: updErr.message }, 400);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const auth_user_id = String(body?.auth_user_id || "");
      const password = String(body?.password || "");
      if (!auth_user_id || !password) return json({ error: "auth_user_id and password required" }, 400);

      const { error: updErr } = await admin.auth.admin.updateUserById(auth_user_id, { password });
      if (updErr) return json({ error: "reset_password failed", details: updErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});