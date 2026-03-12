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

async function countStaffPayouts(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  staffMemberId: string,
) {
  const { count, error } = await admin
    .from("staff_profit_payouts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("staff_member_id", staffMemberId);

  if (error) throw error;
  return count ?? 0;
}

function isMissingAuthUser(error: unknown, user: unknown) {
  if (user) return false;
  if (!error) return true;
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  return message.includes("not found");
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
    // New self-signup accounts may not have owner metadata stamped yet.
    // In that case, treat the account as the owner of its own tenant.
    const isOwnerCaller =
      callerRole === "owner" ||
      !tenantIdFromToken ||
      tenantIdFromToken === caller.id;

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

    if (action === "list") {
      const { data: rows, error: listErr } = await admin
        .from("staff_members")
        .select(
          "id, tenant_id, auth_user_id, nome, email, role, permissions, commission_pct, active, created_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (listErr) {
        return json({ error: "list staff failed", details: listErr.message }, 400);
      }

      const visibleRows: Json[] = [];

      for (const row of rows ?? []) {
        const authUserId = String(row.auth_user_id ?? "");
        if (!authUserId) continue;

        const { data: authUserRes, error: authUserErr } = await admin.auth.admin.getUserById(authUserId);
        if (isMissingAuthUser(authUserErr, authUserRes?.user)) {
          const payoutCount = await countStaffPayouts(admin, tenantId, String(row.id));
          if (payoutCount === 0) {
            const { error: cleanupErr } = await admin
              .from("staff_members")
              .delete()
              .eq("tenant_id", tenantId)
              .eq("id", row.id);
            if (cleanupErr) {
              return json({ error: "cleanup orphan staff failed", details: cleanupErr.message }, 400);
            }
          }
          continue;
        }
        if (authUserErr) {
          return json({ error: "load auth user failed", details: authUserErr.message }, 400);
        }

        visibleRows.push(row);
      }

      return json({ ok: true, rows: visibleRows });
    }

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

      const updatesAuthState =
        body?.role !== undefined ||
        body?.permissions !== undefined ||
        body?.active !== undefined;

      let authUser: any = null;
      if (updatesAuthState) {
        const { data: authUserRes, error: authUserErr } = await admin.auth.admin
          .getUserById(auth_user_id);

        if (isMissingAuthUser(authUserErr, authUserRes?.user)) {
          if (body?.active === true) {
            return json(
              {
                error:
                  "Este funcionario nao pode ser ativado porque a conta de acesso nao existe mais. Exclua o cadastro local ou crie um novo acesso.",
              },
              400,
            );
          }

          if (body?.role !== undefined || body?.permissions !== undefined) {
            return json(
              {
                error:
                  "Este funcionario nao pode ter cargo ou permissoes alterados porque a conta de acesso nao existe mais.",
              },
              400,
            );
          }
        } else if (authUserErr) {
          return json(
            {
              error: "load auth user failed",
              details: authUserErr.message,
            },
            400,
          );
        } else {
          authUser = authUserRes?.user ?? null;
        }
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

      if (!updatesAuthState) {
        return json({ ok: true });
      }

      if (!authUser) {
        return json({ ok: true, orphaned_auth_user: true });
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

      const nextAppMetadata = buildAppMetadata(authUser.app_metadata, {
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

      if (isMissingAuthUser(authUserErr, authUserRes?.user)) {
        return json({ ok: true, orphaned_auth_user: true });
      }
      if (authUserErr) {
        return json(
          {
            error: "load auth user failed",
            details: authUserErr.message,
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

    if (action === "delete") {
      const auth_user_id = String(body?.auth_user_id || "");
      if (!auth_user_id) return json({ error: "auth_user_id required" }, 400);
      if (auth_user_id === caller.id) {
        return json({ error: "You cannot delete your own account" }, 400);
      }

      const { data: currentStaff, error: currentStaffErr } = await admin
        .from("staff_members")
        .select("id, role, permissions")
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

      const { count: payoutCount, error: payoutErr } = await admin
        .from("staff_profit_payouts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("staff_member_id", currentStaff.id);

      if (payoutErr) {
        return json(
          { error: "load staff payouts failed", details: payoutErr.message },
          400,
        );
      }

      const { data: authUserRes, error: authUserErr } = await admin.auth.admin
        .getUserById(auth_user_id);

      if ((payoutCount ?? 0) > 0) {
        if (isMissingAuthUser(authUserErr, authUserRes?.user)) {
          return json(
            {
              error:
                "Este funcionario ja nao possui conta de acesso e tem historico de repasses. Nao e possivel ativar nem excluir esse cadastro; mantenha-o inativo.",
            },
            400,
          );
        }

        return json(
          {
            error:
              "Este funcionario tem historico de repasses e nao pode ser excluido. Use Bloquear em vez de Excluir.",
          },
          400,
        );
      }

      if (isMissingAuthUser(authUserErr, authUserRes?.user)) {
        const { error: deleteStaffErr } = await admin
          .from("staff_members")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("auth_user_id", auth_user_id);

        if (deleteStaffErr) {
          return json(
            { error: "delete staff_members failed", details: deleteStaffErr.message },
            400,
          );
        }

        return json({ ok: true, orphaned_auth_user: true });
      }
      if (authUserErr) {
        return json(
          {
            error: "load auth user failed",
            details: authUserErr.message,
          },
          400,
        );
      }

      const nextAppMetadata = buildAppMetadata(authUserRes.user.app_metadata, {
        tenantId,
        role: normalizeRole(currentStaff.role),
        active: false,
        permissions: {},
      });

      const { error: authDisableErr } = await admin.auth.admin.updateUserById(
        auth_user_id,
        { app_metadata: nextAppMetadata },
      );

      if (authDisableErr) {
        return json(
          { error: "disable auth metadata failed", details: authDisableErr.message },
          400,
        );
      }

      const { error: deleteStaffErr } = await admin
        .from("staff_members")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", auth_user_id);

      if (deleteStaffErr) {
        return json(
          { error: "delete staff_members failed", details: deleteStaffErr.message },
          400,
        );
      }

      const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(auth_user_id);
      if (deleteAuthErr) {
        return json(
          { error: "delete auth user failed", details: deleteAuthErr.message },
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
