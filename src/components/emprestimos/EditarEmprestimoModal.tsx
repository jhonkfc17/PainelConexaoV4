import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Emprestimo } from "@/store/useEmprestimosStore";

type Props = {
  open: boolean;
  emprestimo: Emprestimo | null;
  onClose: () => void;
  onSaved?: () => void;
};

type ParcelaEditable = {
  id: string;
  numero: number;
  valor: number;
  vencimento: string;
};

export default function EditarEmprestimoModal({ open, emprestimo, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parcelas = useMemo<ParcelaEditable[]>(() => {
    if (!emprestimo) return [];
    const arr = Array.isArray((emprestimo as any).parcelasDb) ? ((emprestimo as any).parcelasDb as any[]) : [];
    return arr
      .map((p) => ({
        id: String(p.id ?? ""),
        numero: Number(p.numero ?? 0),
        valor: Number(p.valor ?? 0),
        vencimento: String(p.vencimento ?? ""),
      }))
      .sort((a, b) => a.numero - b.numero);
  }, [emprestimo]);

  const [vencimentos, setVencimentos] = useState<Record<string, string>>({});
  const [valores, setValores] = useState<Record<string, string>>({});

  const handleChange = (id: string, value: string) => {
    setVencimentos((prev) => ({ ...prev, [id]: value }));
  };

  const handleValorChange = (id: string, value: string) => {
    setValores((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    if (!emprestimo) return;
    const changes = parcelas
      .map((p) => {
        const novoVenc = vencimentos[p.id];
        const novoValorRaw = valores[p.id];
        const valorNumber = novoValorRaw !== undefined ? Number(novoValorRaw) : p.valor;
        const valorChanged = novoValorRaw !== undefined && Number.isFinite(valorNumber) && valorNumber !== p.valor;
        const vencChanged = Boolean(novoVenc) && novoVenc !== p.vencimento;

        if (!vencChanged && !valorChanged) return null;

        const update: Record<string, any> = {};
        if (vencChanged) update.vencimento = novoVenc;
        if (valorChanged) update.valor = Math.max(0, valorNumber);

        return { id: p.id, update };
      })
      .filter(Boolean) as { id: string; update: Record<string, any> }[];

    if (changes.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const ch of changes) {
        const { error: upErr } = await supabase.from("parcelas").update(ch.update).eq("id", ch.id);
        if (upErr) throw upErr;
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao salvar alterações");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !emprestimo) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Editar empréstimo</div>
            <div className="text-xs text-white/60">Ajuste datas de vencimento e valores das parcelas</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3 space-y-3">
          {parcelas.length === 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Este empréstimo não possui parcelas carregadas para edição.
            </div>
          ) : (
            parcelas.map((p) => {
              const value = vencimentos[p.id] ?? p.vencimento ?? "";
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 flex items-center gap-3 text-sm text-white/80"
                >
                  <div className="w-24 font-semibold text-white">Parcela {p.numero}</div>
                  <div className="flex-1">
                    <label className="text-[11px] uppercase tracking-wide text-white/60">Vencimento</label>
                    <input
                      type="date"
                      value={value}
                      onChange={(e) => handleChange(p.id, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400/60 focus:outline-none"
                    />
                  </div>
                  <div className="w-32">
                    <label className="text-[11px] uppercase tracking-wide text-white/60">Valor</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valores[p.id] ?? Number(p.valor || 0).toFixed(2)}
                      onChange={(e) => handleValorChange(p.id, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400/60 focus:outline-none text-right"
                    />
                  </div>
                </div>
              );
            })
          )}

          {error ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
