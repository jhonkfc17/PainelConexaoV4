import React, { useMemo, useState } from "react";
import { useClientesStore } from "../../store/useClientesStore";
import { useEmprestimosDraftStore } from "../../store/useEmprestimosDraftStore";
import { useUIStore } from "../../store/useUIStore";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm opacity-80">{label}</div>
      {children}
    </div>
  );
}

export default function NovoEmprestimoSidebar() {
  const { openBuscarCliente } = useUIStore();
  const selectedCliente = useClientesStore((s) => s.selectedCliente);
  const { draft, setDraft, reset } = useEmprestimosDraftStore();

  const [valor, setValor] = useState(draft.valor ? String(draft.valor) : "");
  const [parcelas, setParcelas] = useState(draft.parcelas ? String(draft.parcelas) : "");
  const [juros, setJuros] = useState(draft.jurosMensal ? String(draft.jurosMensal) : "");

  const clienteLabel = useMemo(() => {
    if (!selectedCliente) return "Nenhum cliente selecionado";
    return `${selectedCliente.nomeCompleto}${
  selectedCliente.cpf ? ` • ${selectedCliente.cpf}` : ""
}`;
  }, [selectedCliente]);

  function syncDraft() {
    const v = Number(valor.replace(",", "."));
    const p = Number(parcelas);
    const j = Number(juros.replace(",", "."));

    setDraft({
      valor: Number.isFinite(v) ? v : undefined,
      parcelas: Number.isFinite(p) ? p : undefined,
      jurosMensal: Number.isFinite(j) ? j : undefined,
      clienteId: selectedCliente?.id,
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    syncDraft();

    // Aqui você pluga sua API / criação real
    // Exemplo: await api.post("/emprestimos", {...draft, clienteId: selectedCliente?.id})
    // Por enquanto, só valida:
    if (!selectedCliente) {
      alert("Selecione um cliente antes de criar o empréstimo.");
      return;
    }
    const v = Number(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    alert("Empréstimo (rascunho) pronto! Agora conecte na sua API.");
    // reset(); // se quiser limpar após criar
  }

  return (
    <div className="rc-card p-4 sticky top-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Novo Empréstimo</div>
        <button
          type="button"
          className="rc-btn-outline"
          onClick={() => {
            reset();
            setValor("");
            setParcelas("");
            setJuros("");
          }}
        >
          Limpar
        </button>
      </div>

      <div className="mt-3 rc-card p-3">
        <div className="text-sm opacity-80">Cliente</div>
        <div className="mt-1 font-medium">{clienteLabel}</div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rc-btn-primary" onClick={openBuscarCliente}>
            Buscar cliente
          </button>
          <button
            type="button"
            className="rc-btn-outline"
            onClick={() => openBuscarCliente()}
          >
            Trocar
          </button>
        </div>
      </div>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <Field label="Valor (R$)">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={syncDraft}
            className="rc-input w-full"
            placeholder="Ex: 1500"
            inputMode="decimal"
          />
        </Field>

        <Field label="Parcelas">
          <input
            value={parcelas}
            onChange={(e) => setParcelas(e.target.value)}
            onBlur={syncDraft}
            className="rc-input w-full"
            placeholder="Ex: 12"
            inputMode="numeric"
          />
        </Field>

        <Field label="Juros ao mês (%)">
          <input
            value={juros}
            onChange={(e) => setJuros(e.target.value)}
            onBlur={syncDraft}
            className="rc-input w-full"
            placeholder="Ex: 12"
            inputMode="decimal"
          />
        </Field>

        <div className="pt-2 flex gap-2">
          <button type="submit" className="rc-btn-primary w-full">
            Criar empréstimo
          </button>
        </div>

        <div className="text-xs opacity-70">
          * O botão “Buscar cliente” agora comunica corretamente via store global (não depende de navegar
          entre abas).
        </div>
      </form>
    </div>
  );
}