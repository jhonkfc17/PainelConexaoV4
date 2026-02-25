import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Settings = {
  tenant_id: string;
  enabled: boolean;
  early_days: number;
  send_due_today: boolean;
  send_overdue: boolean;
  send_early: boolean;
  template_due_today: string;
  template_overdue: string;
  template_early: string;
};

type Target = {
  parcela_id: number;
  tenant_id: string;
  emprestimo_id: string | null;
  cliente_id: string | null;
  numero: number | null;
  vencimento: string; // yyyy-mm-dd
  valor: number | null;
  dias_atraso: number | null;
  cliente_nome: string | null;
  telefone: string | null;
  kind: "early" | "due_today" | "overdue";
};

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

function formatBRL(n: number | null) {
  if (n === null || Number.isNaN(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function applyTemplate(tpl: string, data: Record<string, string>) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => data[key] ?? "");
}

function connectorHeaders(token: string) {
  return {
    "content-type": "application/json",
    "x-wa-token": token,
    Authorization: `Bearer ${token}`,
  };
}

async function readJsonSafe(resp: Response) {
  const txt = await resp.text();
  if (!txt) return {};
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

serve(async () => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WA_CONNECTOR_URL = Deno.env.get("WA_CONNECTOR_URL")!;
  const WA_TOKEN = Deno.env.get("WA_TOKEN")!;

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: settingsRows, error: sErr } = await sb
    .from("wa_automation_settings")
    .select("*")
    .eq("enabled", true);

  if (sErr) {
    return new Response(JSON.stringify({ ok: false, step: "settings", error: sErr.message }), { status: 500 });
  }

  const settings = (settingsRows ?? []) as Settings[];
  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  const todayDate = new Date(today + "T00:00:00Z");

  let totalQueued = 0;
  let totalSent = 0;
  let totalFailed = 0;
  const perTenant: Record<string, any> = {};

  for (const st of settings) {
    const tenantId = st.tenant_id;

    const { data: targetsRaw, error: tErr } = await sb
      .from("v_wa_targets")
      .select("*")
      .eq("tenant_id", tenantId);

    if (tErr) {
      perTenant[tenantId] = { ok: false, error: tErr.message };
      continue;
    }

    let targets = (targetsRaw ?? []) as Target[];

    // janela early: hoje+1 até hoje+early_days
    const earlyDays = st.early_days ?? 3;
    const maxEarly = new Date(todayDate);
    maxEarly.setUTCDate(maxEarly.getUTCDate() + earlyDays);

    targets = targets.filter((x) => {
      if (x.kind === "due_today") return st.send_due_today;
      if (x.kind === "overdue") return st.send_overdue;
      if (x.kind === "early") {
        if (!st.send_early) return false;
        const v = new Date(x.vencimento + "T00:00:00Z");
        return v > todayDate && v <= maxEarly;
      }
      return false;
    });

    if (targets.length === 0) {
      perTenant[tenantId] = { ok: true, queued: 0, sent: 0, failed: 0 };
      continue;
    }

    // idempotência: remove os já logados hoje
    const parcelaIds = targets.map((t) => t.parcela_id);
    const { data: already, error: aErr } = await sb
      .from("wa_message_log")
      .select("parcela_id, kind")
      .eq("tenant_id", tenantId)
      .eq("send_date", today)
      .in("parcela_id", parcelaIds);

    if (aErr) {
      perTenant[tenantId] = { ok: false, error: aErr.message };
      continue;
    }

    const sentSet = new Set((already ?? []).map((r: any) => `${r.kind}:${r.parcela_id}`));
    targets = targets.filter((t) => !sentSet.has(`${t.kind}:${t.parcela_id}`));

    if (targets.length === 0) {
      perTenant[tenantId] = { ok: true, queued: 0, sent: 0, failed: 0, skipped_all_as_duplicate: true };
      continue;
    }

    // monta mensagens
    const messages: Array<{ to: string; message: string; meta: Target }> = [];

    for (const t of targets) {
      if (!t.telefone) continue;

      const to = normalizeBR(t.telefone);
      if (!to) continue;

      const tpl =
        t.kind === "due_today" ? st.template_due_today :
        t.kind === "overdue" ? st.template_overdue :
        st.template_early;

      const msg = applyTemplate(tpl, {
        nome: t.cliente_nome ?? "",
        numero: String(t.numero ?? ""),
        vencimento: t.vencimento ?? "",
        valor: formatBRL(t.valor),
        dias_atraso: String(t.dias_atraso ?? 0),
        emprestimo_id: t.emprestimo_id ?? "",
        parcela_id: String(t.parcela_id),
      });

      if (msg.trim().length < 2) continue;

      messages.push({ to, message: msg, meta: t });
    }

    if (messages.length === 0) {
      perTenant[tenantId] = { ok: true, queued: 0, sent: 0, failed: 0, note: "no valid phones/messages" };
      continue;
    }

    // loga como queued
    const logRows = messages.map((m) => ({
      tenant_id: tenantId,
      kind: m.meta.kind,
      parcela_id: m.meta.parcela_id,
      emprestimo_id: m.meta.emprestimo_id,
      cliente_id: m.meta.cliente_id,
      to_phone: m.to,
      message: m.message,
      status: "queued",
      send_date: today,
    }));

    const { data: inserted, error: iErr } = await sb
      .from("wa_message_log")
      .insert(logRows)
      .select("id, to_phone, message");

    if (iErr) {
      perTenant[tenantId] = { ok: false, error: iErr.message };
      continue;
    }

    totalQueued += inserted?.length ?? 0;

    const insertedRows = (inserted ?? []) as Array<{ id: string; to_phone: string; message: string }>;

    // 1) Tenta endpoint em lote (se existir no connector externo)
    const batchPayload = {
      items: insertedRows.map((r) => ({
        to: r.to_phone,
        message: r.message,
      })),
    };

    let batchOk = false;
    let batchStatus = 0;
    let batchResp: any = null;
    try {
      const resp = await fetch(`${WA_CONNECTOR_URL}/send-batch`, {
        method: "POST",
        headers: connectorHeaders(WA_TOKEN),
        body: JSON.stringify(batchPayload),
      });
      batchStatus = resp.status;
      batchResp = await readJsonSafe(resp);
      batchOk = resp.ok;
    } catch (e) {
      batchResp = { error: String(e) };
    }

    const sentIds: string[] = [];
    const failedRows: Array<{ id: string; error: string }> = [];

    if (batchOk) {
      for (const row of insertedRows) sentIds.push(row.id);
    } else {
      // 2) Fallback compatível com conector de referência: envia um por um em /whatsapp/send
      for (const row of insertedRows) {
        try {
          const resp = await fetch(`${WA_CONNECTOR_URL}/whatsapp/send`, {
            method: "POST",
            headers: connectorHeaders(WA_TOKEN),
            body: JSON.stringify({
              tenant_id: tenantId,
              to: row.to_phone,
              message: row.message,
            }),
          });

          const payload = await readJsonSafe(resp);
          if (resp.ok) {
            sentIds.push(row.id);
          } else {
            failedRows.push({
              id: row.id,
              error: `HTTP ${resp.status}: ${JSON.stringify(payload).slice(0, 300)}`,
            });
          }
        } catch (e) {
          failedRows.push({ id: row.id, error: String(e).slice(0, 300) });
        }
      }
    }

    const failedIds = failedRows.map((x) => x.id);
    totalSent += sentIds.length;
    totalFailed += failedIds.length;

    if (sentIds.length > 0) {
      await sb.from("wa_message_log").update({ status: "sent", error: null }).in("id", sentIds);
    }

    if (failedIds.length > 0) {
      const errText =
        failedRows.map((x) => `${x.id}: ${x.error}`).join(" | ").slice(0, 900) ||
        JSON.stringify({ batchStatus, batchResp }).slice(0, 900);

      await sb
        .from("wa_message_log")
        .update({ status: "failed", error: errText })
        .in("id", failedIds);
    }

    perTenant[tenantId] = {
      ok: failedIds.length === 0,
      queued: insertedRows.length,
      sent: sentIds.length,
      failed: failedIds.length,
      connectorResp: {
        batch: { ok: batchOk, status: batchStatus, data: batchResp },
        fallback_single_send_used: !batchOk,
      },
    };
  }

  return new Response(
    JSON.stringify({ ok: true, totalQueued, totalSent, totalFailed, perTenant }, null, 2),
    { headers: { "content-type": "application/json" } },
  );
});
