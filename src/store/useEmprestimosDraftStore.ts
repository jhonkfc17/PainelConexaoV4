import { create } from "zustand";

type EmprestimoDraft = {
  clienteId?: string;
  valor?: number;
  parcelas?: number;
  jurosMensal?: number;
};

type EmprestimosDraftState = {
  draft: EmprestimoDraft;
  setDraft: (patch: Partial<EmprestimoDraft>) => void;
  reset: () => void;
};

export const useEmprestimosDraftStore = create<EmprestimosDraftState>()((set) => ({
  draft: {},
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ draft: {} }),
}));
