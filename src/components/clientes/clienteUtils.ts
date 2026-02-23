export function gerarId(prefix = "cli") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export function hojeISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function iniciais(nome: string) {
  const parts = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "CL";
  const a = parts[0]?.[0] ?? "C";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "L") : (parts[0]?.[1] ?? "L");
  return (a + b).toUpperCase();
}

export function formatCPF(v?: string) {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatTelefone(v?: string) {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function somenteNumeros(v: string) {
  return (v ?? "").replace(/\D/g, "");
}
