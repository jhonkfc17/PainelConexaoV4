import { create } from "zustand";

type UIState = {
  isBuscarClienteOpen: boolean;
  openBuscarCliente: () => void;
  closeBuscarCliente: () => void;
};

export const useUIStore = create<UIState>()((set) => ({
  isBuscarClienteOpen: false,
  openBuscarCliente: () => set({ isBuscarClienteOpen: true }),
  closeBuscarCliente: () => set({ isBuscarClienteOpen: false }),
}));
