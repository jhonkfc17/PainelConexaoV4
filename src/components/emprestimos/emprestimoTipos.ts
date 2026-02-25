// src/components/emprestimos/emprestimoTipos.ts

export type JurosAplicado = "por_parcela" | "fixo";
// Mantém compatibilidade com modalidades antigas já salvas no banco.
// No modal de criação mostramos apenas: parcelado_mensal | quinzenal | semanal.
export type Modalidade =
  | "parcelado_mensal"
  | "quinzenal"
  | "semanal"
  | "diario"
  | "tabela_price";

export type JurosAtrasoTipo = "valor_por_dia" | "percentual_por_dia";

export type NovoEmprestimoPayload = {
  clienteId: string;

  valor: number;
  taxaJuros: number;
  jurosAplicado: JurosAplicado;
  modalidade: Modalidade;

  parcelas: number;

  dataContrato: string;    // YYYY-MM-DD
  primeiraParcela: string; // YYYY-MM-DD
  prazoDias?: number;
  prazo_dias?: number;

  observacoes?: string;

  cobrarSabado?: boolean;
  cobrarDomingo?: boolean;
  cobrarFeriados?: boolean;
  usarDiaFixoSemana?: boolean;
  usar_dia_fixo_semana?: boolean;
  diaSemanaCobranca?: number;
  dia_semana_cobranca?: number;

  aplicarJurosAtraso?: boolean;
  notificarWhatsapp?: boolean;

  // juros em atraso (quando aplicarJurosAtraso=true)
  jurosAtrasoTipo?: JurosAtrasoTipo;
  jurosAtrasoTaxa?: number; // R$/dia ou %/dia

  // NOVO: lista de vencimentos editável
  vencimentos?: string[]; // YYYY-MM-DD (tamanho = parcelas)
};
