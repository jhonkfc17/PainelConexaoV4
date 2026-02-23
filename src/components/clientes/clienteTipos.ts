// src/components/clientes/clienteTipos.ts

export type TipoCliente = "emprestimo" | "produto" | "geral";

export type EnderecoCliente = {
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export type DocumentoCliente = {
  id: string;
  descricao?: string;
  nomeArquivo: string;

  // IMPORTANTE: vamos salvar o arquivo aqui (base64/dataURL)
  mimeType: string; // ex: "image/png" | "application/pdf"
  dataUrl: string;  // ex: "data:image/png;base64,..." | "data:application/pdf;base64,..."

  createdAt: string;
};

export type Cliente = {
  id: string;

  nomeCompleto: string;
  cpf?: string;
  rg?: string;
  email?: string;
  telefone?: string;
  instagram?: string;
  facebook?: string;
  profissao?: string;
  indicacao?: string;

  tipoCliente: TipoCliente;
  ativo: boolean;
  observacoes?: string;

  endereco?: EnderecoCliente;
  documentos?: DocumentoCliente[];

  // foto do perfil (base64 dataURL) - opcional
  fotoDataUrl?: string;

  createdAt: string;
  updatedAt?: string;
};
