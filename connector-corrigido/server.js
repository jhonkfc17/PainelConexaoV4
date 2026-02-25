/* eslint-disable no-console */
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const pkg = require("whatsapp-web.js");
const qrcode = require("qrcode");

dotenv.config();

const { Client, LocalAuth } = pkg;

const app = express();

const PORT = Number(process.env.PORT || 3000);
const API_KEY = String(process.env.API_KEY || "").trim();
const SESSIONS_DIR = String(process.env.SESSIONS_DIR || "/sessions").trim();
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
const SEND_TIMEOUT_MS = Number(process.env.SEND_TIMEOUT_MS || 120000);

const envAllowed = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const defaultAllowed = ["http://localhost:5173"];
const allowedOrigins = new Set([...defaultAllowed, ...envAllowed]);

if (!API_KEY) {
  console.error("❌ API_KEY não configurada.");
}

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

app.use(express.json({ limit: "2mb" }));

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (envAllowed.length === 0) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-wa-token"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

function requireApiKey(req, res, next) {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  if (!API_KEY) return res.status(500).json({ error: "API_KEY não configurada no servidor" });

  const auth = String(req.headers.authorization || "");
  const xWaToken = String(req.headers["x-wa-token"] || "");
  const ok = auth === `Bearer ${API_KEY}` || xWaToken === API_KEY;
  if (!ok) return res.status(401).json({ error: "Unauthorized" });
  return next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "up", time: new Date().toISOString() });
});

app.use(requireApiKey);

const sessions = {};

function normalizePhone(to) {
  const digits = String(to || "").replace(/\D/g, "");
  if (!digits) return "";
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `${withCountry}@c.us`;
}

function withTimeout(promise, ms, label = "op") {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout:${label}:${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getTenant(req) {
  return (
    req.body?.tenant_id ||
    req.body?.tenantId ||
    req.query?.tenant_id ||
    req.query?.tenantId ||
    null
  );
}

function ensureClient(tenantId) {
  if (sessions[tenantId]) return sessions[tenantId];

  const dataPath = path.resolve(SESSIONS_DIR);
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: tenantId, dataPath }),
    puppeteer: {
      executablePath: PUPPETEER_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      protocolTimeout: Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 120000),
    },
  });

  sessions[tenantId] = {
    tenantId,
    client,
    status: "initializing",
    qr: null,
    lastError: null,
    lastEventAt: Date.now(),
  };

  const touch = () => {
    if (sessions[tenantId]) sessions[tenantId].lastEventAt = Date.now();
  };

  client.on("qr", async (qrText) => {
    touch();
    sessions[tenantId].status = "qr";
    sessions[tenantId].qr = await qrcode.toDataURL(qrText);
  });

  client.on("authenticated", () => {
    touch();
    sessions[tenantId].status = "authenticated";
  });

  client.on("ready", () => {
    touch();
    sessions[tenantId].status = "ready";
    sessions[tenantId].qr = null;
    sessions[tenantId].lastError = null;
  });

  client.on("auth_failure", (msg) => {
    touch();
    sessions[tenantId].status = "auth_failure";
    sessions[tenantId].lastError = String(msg || "auth_failure");
  });

  client.on("disconnected", (reason) => {
    touch();
    sessions[tenantId].status = "disconnected";
    sessions[tenantId].lastError = String(reason || "disconnected");
  });

  client
    .initialize()
    .then(() => touch())
    .catch((err) => {
      touch();
      sessions[tenantId].status = "error";
      sessions[tenantId].lastError = String(err?.message || err);
    });

  return sessions[tenantId];
}

app.post("/whatsapp/init", (req, res) => {
  const tenantId = String(getTenant(req) || "").trim();
  if (!tenantId) return res.status(400).json({ error: "tenant_id obrigatório" });

  const s = ensureClient(tenantId);
  return res.json({
    ok: true,
    tenant_id: tenantId,
    status: s.status,
    hasQr: Boolean(s.qr),
    lastError: s.lastError,
    lastEventAt: s.lastEventAt,
  });
});

app.get("/whatsapp/status", (req, res) => {
  const tenantId = String(getTenant(req) || "").trim();
  if (!tenantId) return res.status(400).json({ error: "tenant_id obrigatório" });

  const s = ensureClient(tenantId);
  return res.json({
    ok: true,
    tenant_id: tenantId,
    status: s.status,
    hasQr: Boolean(s.qr),
    lastError: s.lastError,
    lastEventAt: s.lastEventAt,
  });
});

app.get("/whatsapp/qr", (req, res) => {
  const tenantId = String(getTenant(req) || "").trim();
  if (!tenantId) return res.status(400).json({ error: "tenant_id obrigatório" });

  const s = ensureClient(tenantId);
  return res.json({
    ok: true,
    tenant_id: tenantId,
    status: s.status,
    hasQr: Boolean(s.qr),
    qr: s.qr || null,
    lastError: s.lastError,
    lastEventAt: s.lastEventAt,
  });
});

app.post("/whatsapp/send", async (req, res) => {
  const tenantId = String(getTenant(req) || "").trim();
  const to = String(req.body?.to || req.body?.number || "").trim();
  const message = String(req.body?.message || req.body?.msg || "").trim();

  if (!tenantId) return res.status(400).json({ error: "tenant_id obrigatório" });
  if (!to || !message) return res.status(400).json({ error: "to e message são obrigatórios" });

  const s = ensureClient(tenantId);
  if (s.status !== "ready") {
    return res.status(400).json({ error: "Cliente não conectado", status: s.status });
  }

  try {
    const chatId = normalizePhone(to);
    if (!chatId) return res.status(400).json({ error: "Número inválido" });

    await withTimeout(s.client.sendMessage(chatId, message), SEND_TIMEOUT_MS, "sendMessage");
    s.lastEventAt = Date.now();
    return res.json({ ok: true, tenant_id: tenantId, to: chatId });
  } catch (e) {
    s.lastError = String(e?.message || e);
    s.lastEventAt = Date.now();
    return res.status(500).json({ error: s.lastError });
  }
});

// Opcional: envio em lote para automações
app.post("/send-batch", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) return res.status(400).json({ error: "items obrigatório (array)" });

  const results = [];
  for (const item of items) {
    const tenantId = String(item?.tenant_id || item?.tenantId || "").trim();
    const to = String(item?.to || "").trim();
    const message = String(item?.message || "").trim();

    if (!tenantId || !to || !message) {
      results.push({ ok: false, error: "tenant_id/to/message obrigatórios", item });
      continue;
    }

    const s = ensureClient(tenantId);
    if (s.status !== "ready") {
      results.push({ ok: false, error: "Cliente não conectado", status: s.status, tenant_id: tenantId, to });
      continue;
    }

    try {
      const chatId = normalizePhone(to);
      await withTimeout(s.client.sendMessage(chatId, message), SEND_TIMEOUT_MS, "sendBatch");
      s.lastEventAt = Date.now();
      results.push({ ok: true, tenant_id: tenantId, to: chatId });
    } catch (e) {
      s.lastError = String(e?.message || e);
      s.lastEventAt = Date.now();
      results.push({ ok: false, tenant_id: tenantId, to, error: s.lastError });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const status = failed > 0 ? 207 : 200;
  return res.status(status).json({ ok: failed === 0, total: results.length, failed, results });
});

app.post("/whatsapp/logout", async (req, res) => {
  const tenantId = String(getTenant(req) || "").trim();
  if (!tenantId) return res.status(400).json({ error: "tenant_id obrigatório" });

  const s = sessions[tenantId];
  if (!s) return res.json({ ok: true, tenant_id: tenantId, status: "not_found" });

  try {
    await s.client.logout();
  } catch (_) {}
  try {
    await s.client.destroy();
  } catch (_) {}

  delete sessions[tenantId];
  return res.json({ ok: true, tenant_id: tenantId, status: "logged_out" });
});

app.listen(PORT, () => {
  console.log(`✅ WhatsApp connector rodando na porta ${PORT}`);
});
