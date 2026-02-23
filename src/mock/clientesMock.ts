export type Cliente = {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
};

export const clientesMock: Cliente[] = [
  { id: "cli_001", nome: "Ana Souza", cpf: "123.456.789-00", telefone: "(11) 99999-1111" },
  { id: "cli_002", nome: "Bruno Lima", cpf: "987.654.321-00", telefone: "(11) 98888-2222" },
  { id: "cli_003", nome: "Carla Ferreira", cpf: "456.789.123-00", telefone: "(11) 97777-3333" },
  { id: "cli_004", nome: "Diego Santos", cpf: "321.654.987-00", telefone: "(11) 96666-4444" },
  { id: "cli_005", nome: "Elisa Martins", cpf: "111.222.333-44", telefone: "(11) 95555-5555" },
];
