import { create } from "zustand";
import type { Cliente } from "../components/clientes/clienteTipos";
import { deleteCliente, listClientes, upsertCliente } from "../services/clientes.service";

type ClientesState = {
  clientes: Cliente[];
  selectedCliente: Cliente | null;

  loading: boolean;
  error: string | null;

  fetchClientes: () => Promise<void>;
  saveCliente: (cliente: Cliente) => Promise<Cliente | null>;
  removeCliente: (id: string) => Promise<void>;

  selectCliente: (cliente: Cliente) => void;
  clearSelectedCliente: () => void;
  search: (q: string) => Cliente[];
};

export const useClientesStore = create<ClientesState>()((set, get) => ({
  clientes: [],
  selectedCliente: null,
  loading: false,
  error: null,

  fetchClientes: async () => {
    set({ loading: true, error: null });
    try {
      const clientes = await listClientes();
      set({ clientes, loading: false });

      const sel = get().selectedCliente;
      if (sel && !clientes.some((c) => c.id === sel.id)) {
        set({ selectedCliente: null });
      }
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao carregar clientes", loading: false });
    }
  },

  saveCliente: async (cliente) => {
    set({ loading: true, error: null });
    try {
      const saved = await upsertCliente(cliente);
      set((s) => {
        const idx = s.clientes.findIndex((c) => c.id === saved.id);
        const next = [...s.clientes];
        if (idx >= 0) next[idx] = saved;
        else next.unshift(saved);
        return { clientes: next, loading: false };
      });
      return saved;
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao salvar cliente", loading: false });
      return null;
    }
  },

  removeCliente: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteCliente(id);
      set((s) => ({
        clientes: s.clientes.filter((c) => c.id !== id),
        selectedCliente: s.selectedCliente?.id === id ? null : s.selectedCliente,
        loading: false,
      }));
    } catch (e: any) {
      set({ error: e?.message ?? "Falha ao excluir cliente", loading: false });
    }
  },

  selectCliente: (cliente) => set({ selectedCliente: cliente }),
  clearSelectedCliente: () => set({ selectedCliente: null }),

  search: (q) => {
    const query = (q ?? "").trim().toLowerCase();
    const list = get().clientes;
    if (!query) return list;

    return list.filter((c) => {
      const nome = (c.nomeCompleto ?? "").toLowerCase();
      const cpf = (c.cpf ?? "").toLowerCase();
      const tel = (c.telefone ?? "").toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      return nome.includes(query) || cpf.includes(query) || tel.includes(query) || email.includes(query);
    });
  },
}));
