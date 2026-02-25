// src/components/WhatsAppConnectorCard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode, RefreshCw, Send, Smartphone, AlertTriangle } from "lucide-react";
import { waInit, waQr, waSend, waStatus } from "../services/whatsappConnector";
import { useAuthStore } from "../store/useAuthStore";

type Props = {
  tenantId?: string;
};

function isAuthErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("invalid jwt") ||
    msg.includes("unauthorized") ||
    msg.includes("nao autenticado") ||
    msg.includes("sessao invalida") ||
    msg.includes("sessao expirada")
  );
}

export default function WhatsAppConnectorCard({ tenantId: tenantIdProp }: Props) {
  const tenantFromStore = useAuthStore((s) => s.tenantId);
  const tenantId = tenantIdProp ?? tenantFromStore ?? undefined;

  const [status, setStatus] = useState<string>("idle");
  const [connectedNumber, setConnectedNumber] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("Olá! Teste do Raposacobra ✅");
  const [sending, setSending] = useState(false);

  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  const isReady = useMemo(() => status === "ready", [status]);
  const isConfigured = !!tenantId;

  async function refresh() {
    if (!tenantId) return;
    try {
      const st = await waStatus(tenantId);
      setStatus(st.status);
      setConnectedNumber(st.connectedNumber);
      setLastError(st.lastError);

      if (st.status !== "ready") {
        const qr = await waQr(tenantId);
        if (qr.hasQr && qr.qr) setQrDataUrl(qr.qr);
        else setQrDataUrl(null);
      } else {
        setQrDataUrl(null);
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      setLastError(msg);
      if (isAuthErrorMessage(msg) && pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  }

  async function initIfNeeded() {
    if (!tenantId) return;
    try {
      await waInit(tenantId);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setLastError(msg);
      if (isAuthErrorMessage(msg) && pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setLastError(null);

      if (!tenantId) {
        setLoading(false);
        return;
      }

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
  }, [tenantId]);

  async function onSend() {
    if (!tenantId) return;
    setSending(true);
    setLastError(null);
    try {
      await waSend(tenantId, to, msg);
      alert("Mensagem enviada ✅");
    } catch (e: any) {
      setLastError(String(e?.message || e));
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
            <div className="text-sm text-slate-400">Conecte um WhatsApp por tenant (sessão dedicada)</div>
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

      {!isConfigured ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5" />
            <div>
              <div className="font-semibold">Tenant não identificado</div>
              <div className="mt-1 text-amber-100/80">
                Faça login novamente ou confirme se o usuário possui{" "}
                <code className="px-1 py-0.5 rounded bg-black/20">tenant_id</code>.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
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
              {loading ? "carregando..." : status}
              {isReady ? " ✅" : ""}
            </span>
            {connectedNumber ? <span className="text-slate-400">({connectedNumber})</span> : null}
          </div>

          {lastError ? (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
              <b>Erro:</b> {lastError}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <QrCode size={16} className="text-emerald-200" />
                <div className="text-sm font-semibold">QR Code</div>
              </div>
              <div className="mt-1 text-xs text-slate-400">Escaneie com o WhatsApp para conectar.</div>

              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3 flex items-center justify-center min-h-[280px]">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="max-h-[260px] w-auto rounded-lg" />
                ) : (
                  <div className="text-sm text-slate-400 text-center">{isReady ? "Conectado ✅" : "Gerando QR..."}</div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-400">
                Dica: se o QR não aparecer, clique em <b>Atualizar</b>.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold">Enviar mensagem (teste)</div>
              <div className="mt-1 text-xs text-slate-400">Use apenas para validar a conexão do tenant.</div>

              <div className="mt-4 grid gap-3">
                <div>
                  <div className="text-xs text-slate-300">Número (com DDD)</div>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Ex: 5599999999999"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-emerald-500/35"
                  />
                </div>

                <div>
                  <div className="text-xs text-slate-300">Mensagem</div>
                  <textarea
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    rows={5}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-emerald-500/35"
                  />
                </div>

                <button
                  onClick={onSend}
                  disabled={!isReady || sending || !to.trim() || !msg.trim()}
                  className="rounded-xl bg-emerald-500 text-slate-950 px-4 py-3 text-sm font-semibold hover:opacity-95 disabled:opacity-60"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Send size={16} />
                    {sending ? "Enviando..." : "Enviar"}
                  </span>
                </button>

                <div className="text-xs text-slate-400">
                  {isReady ? "Pronto para enviar." : "Conecte o WhatsApp para habilitar o envio."}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
