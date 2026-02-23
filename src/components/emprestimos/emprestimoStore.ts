import type { NovoEmprestimoPayload } from "./emprestimoTipos";

export type Emprestimo = NovoEmprestimoPayload & {
  id: string;
  criadoEm: string; // ISO
};

const KEY = "cobrafacil_emprestimos_v1";

export function listarEmprestimos(): Emprestimo[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Emprestimo[];
  } catch {
    return [];
  }
}

export function salvarEmprestimos(lista: Emprestimo[]) {
  localStorage.setItem(KEY, JSON.stringify(lista));
}

export function criarEmprestimo(payload: NovoEmprestimoPayload): Emprestimo {
  const novo: Emprestimo = {
    ...payload,
    id: crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
  };

  const lista = listarEmprestimos();
  lista.unshift(novo);
  salvarEmprestimos(lista);

  return novo;
}
