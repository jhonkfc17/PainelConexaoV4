import { useMemo, useState } from "react";
import { sendWhatsAppFromPanel } from "../../services/whatsappDispatch";

type Props = {
  open: boolean;
  title: string;
  linhas: string[];
  whatsappPhone?: string; // e.g. 55DDDNUM (apenas dígitos) ou qualquer formato
  onClose: () => void;
};

export default function ComprovanteModal({ open, title, linhas, whatsappPhone, onClose }: Props) {
  const texto = useMemo(() => linhas.join("\n"), [linhas]);
  const [sending, setSending] = useState(false);

  if (!open) return null;

  function copiar() {
    navigator.clipboard.writeText(texto).then(
      () => alert("Copiado!"),
      () => alert("Não foi possível copiar")
    );
  }

  async function enviarWhatsAppDireto() {
    if (!whatsappPhone) {
      alert("Cliente sem telefone cadastrado.");
      return;
    }

    setSending(true);
    try {
      await sendWhatsAppFromPanel({
        to: whatsappPhone,
        message: texto,
      });
      alert("Mensagem enviada ✅");
    } catch (e: any) {
      alert(String(e?.message || e) || "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  function imprimirComoPdf() {
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            body{font-family:Arial, sans-serif; padding:24px;}
            h1{font-size:18px; margin:0 0 12px 0;}
            pre{white-space:pre-wrap; font-size:13px; line-height:1.4;}
            .box{border:1px solid #ddd; border-radius:12px; padding:16px;}
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="box"><pre>${texto.replace(/</g, "&lt;")}</pre></div>
          <script>window.print()</script>
        </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (!w) return alert("Permita pop-ups para imprimir/baixar PDF");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[92vw] max-w-[560px] rounded-2xl border border-white/10 bg-[#0B1312] p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-white/60">Envie para o cliente ou salve como PDF.</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-white/70 hover:bg-white/10">
            ✕
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <pre className="whitespace-pre-wrap text-sm text-white/80 leading-relaxed">{texto}</pre>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={copiar}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Copiar texto
          </button>

          <button
            onClick={enviarWhatsAppDireto}
            disabled={sending || !whatsappPhone}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-60"
            title={!whatsappPhone ? "Cliente sem telefone" : undefined}
          >
            {sending ? "Enviando..." : "Enviar no WhatsApp"}
          </button>

          <button
            onClick={imprimirComoPdf}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            Baixar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
