export type Modalidade = "diario" | "mensal" | "tabela_price";
export type JurosAplicado = "por_parcela" | "total";

export type Emprestimo = {
  id: string;
  clienteId?: string;
  clienteNome: string;
  clienteContato?: string;

  valor: number;
  taxaJuros: number; // %
  jurosAplicado: JurosAplicado;
  modalidade: Modalidade;
  numeroParcelas: number;

  dataContrato: string; // yyyy-mm-dd
  primeiraParcela: string; // yyyy-mm-dd

  // vencimentos (editáveis)
  vencimentos: string[];
  // parcelas pagas (índices 0-based)
  parcelasPagas: number[];

  naoCobrarSabado: boolean;
  naoCobrarDomingo: boolean;
  naoCobrarFeriado: boolean;

  observacoes?: string;

  // renovação automática (pagamento de juros/mínimo)
  renovadoEm?: string; // ISO
  renovadoParaId?: string;
  renovadoMotivo?: "juros" | "minimo";

  aplicarJurosAtraso: boolean;
  notificarWhatsapp: boolean;

  jurosAtrasoTipo?: "valor_por_dia" | "percentual_por_dia";
  jurosAtrasoTaxa?: number;

  // calculados
  jurosTotal: number;
  totalReceber: number;
  valorParcela: number;
  // parcelas vindas do banco (para dashboard/cards)
  parcelasDb?: {
    id: number;
    numero: number;
    vencimento: string;
    valor: number;
    pago: boolean;
    pago_em: string | null;
    valor_pago: number | null;
    juros_atraso: number | null;
  }[];

  criadoEm: string; // ISO
  status: "ativo" | "finalizado" | "atrasado";
};

const KEY = "cobrafacil_emprestimos_v1";

export function carregarEmprestimos(): Emprestimo[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const lista = JSON.parse(raw) as Partial<Emprestimo>[];
    return lista.map((e) => ({
      ...e,
      vencimentos: Array.isArray(e.vencimentos) ? (e.vencimentos as string[]) : [],
      parcelasPagas: Array.isArray(e.parcelasPagas) ? (e.parcelasPagas as number[]) : [],
      status: (e.status as any) || "ativo",
    })) as Emprestimo[];
  } catch {
    return [];
  }
}

export function salvarEmprestimos(lista: Emprestimo[]) {
  localStorage.setItem(KEY, JSON.stringify(lista));
}

export function gerarId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
