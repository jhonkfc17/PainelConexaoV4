import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, any>;
type StaffRole = "staff" | "admin";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ✅ garante UTF-8 (emojis/acentos) no retorno
function json(data: Json, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Json) }
    : {};
}

function normalizeRole(value: unknown): StaffRole {
  const role = String(value ?? "staff").trim().toLowerCase();
  if (role !== "staff" && role !== "admin") {
    throw new Error("role must be 'staff' or 'admin'");
  }
  return role;
}

function normalizePermissions(value: unknown): Json {
  const raw = asObject(value);
  return Object.fromEntries(
    Object.entries(raw).map(([key, enabled]) => [key, Boolean(enabled)]),
  );
}

function buildAppMetadata(
  currentMeta: unknown,
  {
    tenantId,
    role,
    active,
    permissions,
  }: {
    tenantId: string;
    role: StaffRole;
    active: boolean;
    permissions: Json;
  },
): Json {
  return {
    ...asObject(currentMeta),
    tenant_id: tenantId,
    role,
    active,
    permissions,
  };
}

Deno.serve(async (req) => {
  // ✅ OPTIONS consistente + UTF-8
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      return json(
        {
          error:
            "Missing secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY",
        },
        500,
      );
    }

    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
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
      return json(
        { error: "Unauthorized", details: userErr?.message ?? "Invalid token" },
        401,
      );
    }
    const caller = userRes.user;

    // Admin client
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const tenantIdFromToken = (caller.app_metadata as any)?.tenant_id ?? null;
    const callerRole = String((caller.app_metadata as any)?.role ?? "").trim().toLowerCase();
    const tenantId = tenantIdFromToken ?? caller.id;
    const isOwnerCaller = callerRole === "owner";

    if (!isOwnerCaller) {
      if (!tenantIdFromToken) {
        return json(
          { error: "Forbidden", details: "Caller has no tenant context" },
          403,
        );
      }

      const { data: staffRow, error: staffErr } = await admin
        .from("staff_members")
        .select("role, active")
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", caller.id)
        .maybeSingle();

      if (staffErr) {
        return json(
          { error: "staff lookup failed", details: staffErr.message },
          500,
        );
      }
      if (!staffRow?.active || staffRow.role !== "admin") {
        return json(
          { error: "Forbidden", details: "Caller is not admin/active" },
          403,
        );
      }
    }

    const body = (await req.json().catch(() => ({}))) as Json;
    const action = String(body?.action || "").trim();
    if (!action) return json({ error: "Missing action" }, 400);

    if (action === "create") {
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const nome = String(body?.nome || "");
      const role = normalizeRole(body?.role);
      const permissions = normalizePermissions(body?.permissions);
      const commission_pct = Number(body?.commission_pct ?? 0);

      if (!email || !password) {
        return json({ error: "email and password required" }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin
        .createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: buildAppMetadata({}, {
            tenantId,
            role,
            active: true,
            permissions,
          }),
        });

      if (createErr) {
        return json(
          { error: "createUser failed", details: createErr.message },
          400,
        );
      }

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

      if (insErr) {
        await admin.auth.admin.deleteUser(auth_user_id).catch(() => null);
        return json(
          { error: "insert staff_members failed", details: insErr.message },
          400,
        );
      }
      return json({ ok: true, auth_user_id });
    }

    if (action === "update") {
      const auth_user_id = String(body?.auth_user_id || "");
      if (!auth_user_id) return json({ error: "auth_user_id required" }, 400);

      const update: Record<string, unknown> = {};
      if (body?.nome !== undefined) update.nome = String(body.nome);
      if (body?.role !== undefined) update.role = normalizeRole(body.role);
      if (body?.permissions !== undefined) update.permissions = normalizePermissions(body.permissions);
      if (body?.commission_pct !== undefined) {
        update.commission_pct = Number(body.commission_pct);
      }
      if (body?.active !== undefined) update.active = Boolean(body.active);

      const { data: currentStaff, error: currentStaffErr } = await admin
        .from("staff_members")
        .select("role, permissions, active")
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", auth_user_id)
        .maybeSingle();

      if (currentStaffErr) {
        return json(
          { error: "load current staff failed", details: currentStaffErr.message },
          400,
        );
      }
      if (!currentStaff) {
        return json({ error: "staff member not found" }, 404);
      }

      const { error: updErr } = await admin
        .from("staff_members")
        .update(update)
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", auth_user_id);

      if (updErr) {
        return json(
          { error: "update staff_members failed", details: updErr.message },
          400,
        );
      }

      const nextRole = body?.role !== undefined
        ? normalizeRole(body.role)
        : normalizeRole(currentStaff.role);
      const nextPermissions = body?.permissions !== undefined
        ? normalizePermissions(body.permissions)
        : normalizePermissions(currentStaff.permissions);
      const nextActive = body?.active !== undefined
        ? Boolean(body.active)
        : Boolean(currentStaff.active);

      const { data: authUserRes, error: authUserErr } = await admin.auth.admin
        .getUserById(auth_user_id);

      if (authUserErr || !authUserRes?.user) {
        return json(
          {
            error: "load auth user failed",
            details: authUserErr?.message ?? "User not found in auth.users",
          },
          400,
        );
      }

      const nextAppMetadata = buildAppMetadata(authUserRes.user.app_metadata, {
        tenantId,
        role: nextRole,
        active: nextActive,
        permissions: nextPermissions,
      });

      const { error: authUpdErr } = await admin.auth.admin.updateUserById(
        auth_user_id,
        { app_metadata: nextAppMetadata },
      );

      if (authUpdErr) {
        return json(
          { error: "update auth metadata failed", details: authUpdErr.message },
          400,
        );
      }

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

      if (updErr) {
        return json({ error: "disable failed", details: updErr.message }, 400);
      }

      const { data: authUserRes, error: authUserErr } = await admin.auth.admin
        .getUserById(auth_user_id);

      if (authUserErr || !authUserRes?.user) {
        return json(
          {
            error: "load auth user failed",
            details: authUserErr?.message ?? "User not found in auth.users",
          },
          400,
        );
      }

      const authMeta = asObject(authUserRes.user.app_metadata);
      const nextRole = normalizeRole(authMeta.role);
      const nextPermissions = normalizePermissions(authMeta.permissions);
      const nextAppMetadata = buildAppMetadata(authMeta, {
        tenantId,
        role: nextRole,
        active: false,
        permissions: nextPermissions,
      });

      const { error: authUpdErr } = await admin.auth.admin.updateUserById(
        auth_user_id,
        { app_metadata: nextAppMetadata },
      );

      if (authUpdErr) {
        return json(
          { error: "disable auth metadata failed", details: authUpdErr.message },
          400,
        );
      }

      return json({ ok: true });
    }

    if (action === "reset_password") {
      const auth_user_id = String(body?.auth_user_id || "");
      const password = String(body?.password || "");
      if (!auth_user_id || !password) {
        return json(
          { error: "auth_user_id and password required" },
          400,
        );
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(
        auth_user_id,
        { password },
      );

      if (updErr) {
        return json(
          { error: "reset_password failed", details: updErr.message },
          400,
        );
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
