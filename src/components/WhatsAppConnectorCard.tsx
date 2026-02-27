// src/components/WhatsAppConnectorCard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode, RefreshCw, Send, Smartphone, AlertTriangle } from "lucide-react";
import { waInit, waQr, waSend, waStatus } from "@/services/whatsappConnector";
import { isWhatsAppManualMode, setWhatsAppManualMode } from "@/services/whatsappDispatch";

export default function WhatsAppConnectorCard() {
  const [status, setStatus] = useState<string>("idle");
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("Olá! Teste do Raposacobra ✅");
  const [sending, setSending] = useState(false);

  const [manualMode, setManualMode] = useState<boolean>(() => {
    try {
      return isWhatsAppManualMode();
    } catch {
      return false;
    }
  });

  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  const isReady = useMemo(() => status === "ready", [status]);
  const statusLabel = manualMode ? "manual" : status;

  function prettifyWaError(raw: unknown) {
    const msg = String(raw ?? "");
    const low = msg.toLowerCase();

    if (low.includes("missing authorization") || low.includes("unauthorized") || low.includes("jwt")) {
      return "Sessão expirada ou usuário não autenticado. Faça logout/login e tente novamente.";
    }
    if (
      low.includes("lid") ||
      low.includes("número não encontrado no whatsapp") ||
      low.includes("numero nao encontrado no whatsapp")
    ) {
      return "Número não encontrado no WhatsApp para esta sessão. Tente com DDI 55 (ex.: 5531999999999).";
    }
    if (low.includes("runtime.callfunctionon timed out") || low.includes("protocoltimeout")) {
      return "Conexão ativa, mas o conector demorou para responder. Tente Atualizar em alguns segundos.";
    }
    return msg;
  }

  async function refresh() {
    try {
      if (manualMode) {
        setStatus("manual");
        setConnectedNumber(null);
        setLastError(null);
        setQrDataUrl(null);
        setLoading(false);
        return;
      }
      const st = await waStatus();
      setStatus(st.status);
      setConnectedNumber(st.connectedNumber);
      setLastError(st.lastError);

      // Cloud API não usa QR
      setQrDataUrl(null);
    } catch (e: any) {
      setLastError(prettifyWaError(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function initIfNeeded() {
    try {
      if (manualMode) return;
      await waInit();
    } catch (e: any) {
      setLastError(prettifyWaError(e?.message || e));
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setLastError(null);

      await initIfNeeded();
      if (!mounted) return;

      await refresh();
      if (!mounted) return;

      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(() => {
        refresh();
      }, 2500);
    })();

    return () => {
      mounted = false;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, []);

  async function onSend() {
    setSending(true);
    setLastError(null);
    try {
      await waSend(to, msg);
      alert("Mensagem enviada ✅");
    } catch (e: any) {
      setLastError(prettifyWaError(e?.message || e));
      alert("Falha ao enviar ❌ (veja o erro no card)");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-500/15 bg-slate-950/35 shadow-glow backdrop-blur-md p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
            <Smartphone size={18} className="text-emerald-300" />
          </div>
          <div>
            <div className="text-xl font-semibold">WhatsApp Connector</div>
            <div className="text-sm text-slate-400">Cada usuário conecta o próprio WhatsApp (sessão dedicada)</div>
          </div>
        </div>

        <button
          onClick={() => refresh()}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw size={16} />
            Atualizar
          </span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => {
            setWhatsAppManualMode(true);
            setManualMode(true);
            setStatus("manual");
            setConnectedNumber(null);
            setLastError(null);
            setQrDataUrl(null);
          }}
          className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
        >
          Desconectar (usar WhatsApp Web)
        </button>
        <button
          onClick={() => {
            setWhatsAppManualMode(false);
            setManualMode(false);
            setStatus("idle");
            refresh();
          }}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/15"
        >
          Reconectar Cloud API
        </button>
      </div>

      {lastError && lastError.toLowerCase().includes("não autenticado") ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5" />
            <div>
              <div className="font-semibold">Sessão inválida</div>
              <div className="mt-1 text-amber-100/80">Faça logout/login e tente novamente.</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-300">Status:</span>
        <span
          className={
            "rounded-full border px-3 py-1 text-xs " +
            (isReady
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
              : "border-white/10 bg-white/5 text-slate-200/80")
          }
        >
          {loading ? "carregando..." : statusLabel}
          {isReady && !manualMode ? " ✅" : ""}
        </span>
        {connectedNumber ? <span className="text-slate-400">({connectedNumber})</span> : null}
        {manualMode ? <span className="text-amber-200 text-xs">(manual via WhatsApp Web)</span> : null}
      </div>

      {lastError ? (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
          <b>Erro:</b> {lastError}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <QrCode size={16} />
            <span className="font-semibold">QR Code</span>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 min-h-[240px] flex items-center justify-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="max-h-[220px] max-w-full rounded-lg" />
            ) : (
              <span className="text-slate-400 text-sm">{isReady ? "Conectado ✅" : "Gerando QR..."}</span>
            )}
          </div>

          <div className="mt-3 text-xs text-slate-400">
            Dica: se o QR não aparecer, clique em <b>Atualizar</b>.
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <Send size={16} />
            <span className="font-semibold">Enviar mensagem (teste)</span>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">Número (com DDD)</div>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Ex: 5599999999999"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none"
              />
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Mensagem</div>
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/90 outline-none"
              />
            </div>

            <button
              onClick={onSend}
              disabled={sending}
              className="w-full rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm py-2 disabled:opacity-50"
            >
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
