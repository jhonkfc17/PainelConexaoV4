// src/components/emprestimos/emprestimoCalculos.ts

export type Totais = {
  jurosTotal: number; // R$
  totalAReceber: number; // R$
  valorParcela: number; // R$
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula totais do empréstimo:
 * - Se jurosAplicado = "por_parcela": total = valor * (1 + t * parcelas)
 * - Se jurosAplicado = "fixo":        total = valor * (1 + t)
 * Onde t = taxaJuros / 100
 */
export function calcularTotais(params: {
  valor: number;
  taxaJuros: number; // % (ex.: 10 = 10%)
  parcelas: number;
  jurosAplicado: "por_parcela" | "fixo";
  modalidade: "parcelado_mensal" | "quinzenal" | "semanal" | "diario" | "tabela_price";
}): Totais {
  const valor = Number(params.valor ?? 0);
  const taxa = Number(params.taxaJuros ?? 0);
  const parcelas = Math.max(1, Number(params.parcelas ?? 1));

  const t = taxa / 100;

  let totalAReceber = valor;
  let valorParcela = 0;

  if (params.modalidade === "tabela_price") {
    // Price: parcela fixa com amortização
    const i = t; // taxa por período
    if (i <= 0) {
      valorParcela = valor / parcelas;
      totalAReceber = valor;
    } else {
      const pow = Math.pow(1 + i, parcelas);
      valorParcela = (valor * i * pow) / (pow - 1);
      totalAReceber = valorParcela * parcelas;
    }
  } else {
    // parcelado mensal / diário (modelo simples)
    if (params.jurosAplicado === "por_parcela") {
      totalAReceber = valor * (1 + t * parcelas);
    } else {
      totalAReceber = valor * (1 + t);
    }
    valorParcela = totalAReceber / parcelas;
  }

  const jurosTotal = totalAReceber - valor;

  return {
    jurosTotal: round2(jurosTotal),
    totalAReceber: round2(totalAReceber),
    valorParcela: round2(valorParcela),
  };
}
