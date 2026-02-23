// src/pages/Clientes.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePermissoes } from "../store/usePermissoes";

import ClientesHeader from "../components/clientes/ClientesHeader";
import ClientesToolbar from "../components/clientes/ClientesToolbar";
import ClientesLista from "../components/clientes/ClientesLista";
import ClientesEmptyState from "../components/clientes/ClientesEmptyState";
import NovoClienteModal from "../components/clientes/NovoClienteModal";
import DocumentosModal from "../components/clientes/DocumentosModal";
import ClienteDrawer from "../components/clientes/ClienteDrawer";
import ImportarClientesModal from "../components/clientes/ImportarClientesModal";

import type { Cliente } from "../components/clientes/clienteTipos";
import { useClientesStore } from "../store/useClientesStore";
import { listarScoreClientes, type ClienteScore } from "../services/score.service";

function uid() {
  // O Supabase usa UUID nas colunas id/user_id (tipo uuid no Postgres).
  // Portanto, para evitar erros do tipo:
  // "invalid input syntax for type uuid: ..."
  // sempre gere UUID válido no front quando estiver criando um novo cliente.
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }

  // Fallback simples (não criptográfico) para ambientes sem crypto.randomUUID
  // Formato UUID v4.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function Clientes() {
  const { canManageClients, isAdmin, isOwner } = usePermissoes();
  const canCreate = Boolean(isOwner || isAdmin || canManageClients);
  const nav = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCliente, setDrawerCliente] = useState<Cliente | null>(null);

  const [docsOpen, setDocsOpen] = useState(false);
  const [clienteDocs, setClienteDocs] = useState<Cliente | null>(null);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreById, setScoreById] = useState<Record<string, ClienteScore>>({});
const { clientes, loading, error, fetchClientes, saveCliente, removeCliente } = useClientesStore();

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

useEffect(() => {
  let alive = true;
  (async () => {
    try {
      setScoreLoading(true);
      const list = await listarScoreClientes(clientes);
      if (!alive) return;
      const map: Record<string, ClienteScore> = {};
      for (const s of list) map[s.clienteId] = s;
      setScoreById(map);
    } catch (e) {
      // score é auxiliar: se falhar, não quebra a tela
      console.error("Falha ao carregar score dos clientes:", e);
    } finally {
      if (alive) setScoreLoading(false);
    }
  })();
  return () => {
    alive = false;
  };
}, [clientes]);

  const clientesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;

    return clientes.filter((c) => {
      const blob = [
        c.nomeCompleto,
        c.cpf,
        c.rg,
        c.email,
        c.telefone,
        c.instagram,
        c.facebook,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return blob.includes(q);
    });
  }, [clientes, busca]);

  function abrirDocs(cliente: Cliente) {
    setClienteDocs(cliente);
    setDocsOpen(true);
  }

  function abrirNovoEmprestimo(cliente: Cliente) {
    // Abre a tela de empréstimos já com o modal de novo empréstimo aberto e o cliente pré-selecionado
    nav(`/emprestimos?novo=1&cliente=${encodeURIComponent(cliente.id)}`);
  }

  function abrirNovoCliente() {
    setClienteEditando(null);
    setModalAberto(true);
  }

  function abrirEditarCliente(cliente: Cliente) {
    setClienteEditando(cliente);
    setModalAberto(true);
  }

  async function excluirCliente(id: string) {
    const ok = confirm("Deseja realmente excluir este cliente?");
    if (!ok) return;
    await removeCliente(id);
  }

  async function onSalvarCliente(payload: Partial<Cliente>) {
    const agoraISO = new Date().toISOString();

    const base: Cliente =
      clienteEditando ??
      ({
        id: uid(),
        createdAt: agoraISO,
        nomeCompleto: "",
        cpf: "",
        rg: "",
        email: "",
        telefone: "",
        instagram: "",
        facebook: "",
        profissao: "",
        indicacao: "",
        tipoCliente: "emprestimo",
        ativo: true,
        observacoes: "",
        endereco: {
          cep: "",
          rua: "",
          numero: "",
          complemento: "",
          bairro: "",
          cidade: "",
          uf: "",
        },
        documentos: [],
        updatedAt: agoraISO,
      } as Cliente);

    const atualizado: Cliente = {
      ...base,
      ...payload,
      id: base.id,
      createdAt: base.createdAt ?? agoraISO,
      updatedAt: agoraISO,
    };

    const saved = await saveCliente(atualizado);
    if (saved) {
      setModalAberto(false);
      setClienteEditando(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] p-0 sm:p-2">
      <ClientesHeader
        onClickNovoCliente={canCreate ? abrirNovoCliente : undefined}
        onImportarClientes={canCreate ? () => setImportOpen(true) : undefined}
        canCreate={canCreate}
      />

      <div className="mt-4">
        <ClientesToolbar busca={busca} onChangeBusca={setBusca} />
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 text-sm text-slate-400">Carregando clientes…</div>
      ) : clientesFiltrados.length === 0 ? (
        <ClientesEmptyState />
      ) : (
        <ClientesLista
          clientes={clientesFiltrados}
          scoreById={scoreById}
          onEdit={abrirEditarCliente}
          onDelete={(c) => excluirCliente(c.id)}
          onDocs={(c) => abrirDocs(c)}
          onNewLoan={(c) => abrirNovoEmprestimo(c)}
          onRowClick={(c) => {
            const isMobile = window.matchMedia("(max-width: 767px)").matches;
            if (isMobile) {
              setDrawerCliente(c);
              setDrawerOpen(true);
            } else {
              nav(`/clientes/${c.id}`);
            }
          }}
        />
      )}

      <NovoClienteModal
        open={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setClienteEditando(null);
        }}
        initialData={clienteEditando ?? undefined}
        onCreate={(payload) => onSalvarCliente(payload)}
      />

      <ImportarClientesModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          fetchClientes();
        }}
      />

      <ClienteDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cliente={drawerCliente}
        onEdit={(c) => abrirEditarCliente(c)}
        onDocs={(c) => abrirDocs(c)}
        onNewLoan={(c) => abrirNovoEmprestimo(c)}
      />

      <DocumentosModal
        open={docsOpen}
        cliente={clienteDocs}
        onClose={() => {
          setDocsOpen(false);
          setClienteDocs(null);
        }}
      />
    </div>
  );
}
