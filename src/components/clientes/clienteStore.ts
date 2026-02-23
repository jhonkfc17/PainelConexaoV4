// src/components/clientes/clienteStore.ts
import type { Cliente } from "./clienteTipos";
import { lsGet, lsSet } from "../../utils/localStorage";

const STORAGE_KEY = "cobrafacil_clientes_v1";

function normalizeCliente(raw: any): Cliente | null {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.id) return null;

  const now = new Date().toISOString();

  const cliente: Cliente = {
    id: String(raw.id),
    nomeCompleto: String(raw.nomeCompleto ?? ""),
    cpf: String(raw.cpf ?? ""),
    rg: String(raw.rg ?? ""),
    email: String(raw.email ?? ""),
    telefone: String(raw.telefone ?? ""),
    instagram: String(raw.instagram ?? ""),
    facebook: String(raw.facebook ?? ""),
    profissao: String(raw.profissao ?? ""),
    indicacao: String(raw.indicacao ?? ""),
    tipoCliente: (raw.tipoCliente ?? "emprestimo") as any,
    ativo: Boolean(raw.ativo ?? true),
    observacoes: String(raw.observacoes ?? ""),
    endereco: {
      cep: String(raw.endereco?.cep ?? ""),
      rua: String(raw.endereco?.rua ?? ""),
      numero: String(raw.endereco?.numero ?? ""),
      complemento: String(raw.endereco?.complemento ?? ""),
      bairro: String(raw.endereco?.bairro ?? ""),
      cidade: String(raw.endereco?.cidade ?? ""),
      uf: String(raw.endereco?.uf ?? ""),
    },
    documentos: Array.isArray(raw.documentos) ? raw.documentos : [],
    fotoDataUrl: typeof raw.fotoDataUrl === "string" ? raw.fotoDataUrl : "",
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? raw.createdAt ?? now),
  };

  return cliente;
}

export function loadClientes(): Cliente[] {
  const data = lsGet<any>(STORAGE_KEY, []);
  if (!Array.isArray(data)) return [];

  const normalized = data
    .map(normalizeCliente)
    .filter(Boolean) as Cliente[];

  // ordenar mais recentes primeiro
  normalized.sort((a, b) => {
    const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return db - da;
  });

  return normalized;
}

export function saveClientes(clientes: Cliente[]) {
  lsSet(STORAGE_KEY, clientes);
}

export function upsertCliente(lista: Cliente[], cliente: Cliente): Cliente[] {
  const now = new Date().toISOString();
  const item: Cliente = {
    ...cliente,
    id: String(cliente.id),
    createdAt: cliente.createdAt ?? now,
    updatedAt: now,
  };

  const idx = lista.findIndex((c) => c.id === item.id);
  const next =
    idx === -1
      ? [item, ...lista]
      : lista.map((c) => (c.id === item.id ? { ...c, ...item } : c));

  saveClientes(next);
  return next;
}

export function removeCliente(lista: Cliente[], id: string): Cliente[] {
  const next = lista.filter((c) => c.id !== id);
  saveClientes(next);
  return next;
}

export function getClienteById(lista: Cliente[], id: string): Cliente | undefined {
  return lista.find((c) => c.id === id);
}

export function toggleClienteAtivo(lista: Cliente[], id: string): Cliente[] {
  const now = new Date().toISOString();
  const next = lista.map((c) =>
    c.id === id ? { ...c, ativo: !c.ativo, updatedAt: now } : c
  );
  saveClientes(next);
  return next;
}
