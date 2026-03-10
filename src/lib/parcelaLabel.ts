export function getParcelaLabel(input: {
  numero?: number | null;
  descricao?: string | null;
}) {
  const numero = Number(input?.numero ?? 0);
  const descricao = String(input?.descricao ?? "").trim();
  if (descricao) return `Parcela ${numero} (${descricao})`;
  return `Parcela ${numero}`;
}
