import React, { useEffect, useMemo, useState } from "react";
import type { Cliente } from "../clientes/clienteTipos";
import { useClientesStore } from "../../store/useClientesStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

function ClienteRow({ cliente, onPick }: { cliente: Cliente; onPick: (c: Cliente) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(cliente)}
      className="w-full text-left rc-card p-3 hover:opacity-90 transition"
    >
      <div className="font-semibold">{cliente.nomeCompleto || "Sem nome"}</div>
      <div className="text-sm opacity-70">
        {cliente.cpf ? `CPF: ${cliente.cpf}` : "Sem CPF"}
        {cliente.telefone ? ` • Tel: ${cliente.telefone}` : ""}
        {cliente.email ? ` • ${cliente.email}` : ""}
      </div>
    </button>
  );
}

export default function BuscarClienteModal({ open, onClose }: Props) {
  const [q, setQ] = useState("");

  const { loading, error, fetchClientes, search, selectCliente } = useClientesStore();

  useEffect(() => {
    if (open) {
      fetchClientes();
      setQ("");
    }
  }, [open, fetchClientes]);

  const results = useMemo(() => search(q), [q, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[min(760px,92vw)] -translate-x-1/2 -translate-y-1/2 rc-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Buscar cliente</div>
            <div className="text-sm opacity-70">
              Selecione um cliente para preencher o “Novo Empréstimo”.
            </div>
          </div>
          <button type="button" className="rc-btn-outline" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="mt-3">
          <input
            className="rc-input w-full"
            placeholder="Digite nome, CPF, telefone ou e-mail..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-4 space-y-2 max-h-[55vh] overflow-auto pr-1">
          {loading ? (
            <div className="opacity-70">Carregando…</div>
          ) : results.length === 0 ? (
            <div className="opacity-70">Nenhum cliente encontrado.</div>
          ) : (
            results.map((c) => (
              <ClienteRow
                key={c.id}
                cliente={c}
                onPick={(cliente) => {
                  selectCliente(cliente);
                  onClose();
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
