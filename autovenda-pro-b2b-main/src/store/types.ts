export type VeiculoStatus = "disponivel" | "reservado" | "vendido";

export interface AjustesFoto {
  brilho: number;
  contraste: number;
  saturacao: number;
  calor: number;
}

export interface Veiculo {
  id: string;
  fotos: string[];
  fotosDestaque: number[];
  origem?: "estoque" | "simulacao_custos";
  custosAtivo?: boolean;
  modelo: string;
  marca?: string;
  ano: string;
  km?: string;
  cor?: string;
  cambio?: string;
  multimidia?: "sim" | "nao";
  opcionais?: string;
  custo: string;
  valorVenda: string;
  valorFipe?: string;
  leilao?: boolean;
  sinistro?: boolean;
  status: VeiculoStatus;
  descricaoOlx?: string;
  descricaoWhatsapp?: string;
  descricaoMarketplace?: string;
  hashtags?: string[];
  tituloAnuncio?: string;
  fotoCapaIndex?: number;
  ajustesFoto?: AjustesFoto;
  placa?: string; // preenchido na consulta pela placa
  createdAt: string;
  vendidoEm?: string;
  vendedorId?: string;
  archivedAt?: string;
  deletedAt?: string;
}

export type LeadStatus =
  | "novo"
  | "em_contato"
  | "proposta"
  | "aprovacao"
  | "test_drive"
  | "reservado"
  | "fechado"
  | "perdido";
export type LeadSource = "manual" | "marketplace" | "whatsapp" | "meta_ads";

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  interesse: string;
  origem: LeadSource;
  veiculoId?: string;
  veiculoTexto?: string;
  data: string;
  vendedorId: string;
  status: LeadStatus;
  historico: string[];
  anotacoes: string;
  proximaAcao?: string;
  proximaAcaoEm?: string;
  valorProposta?: number | null;
  testDriveAt?: string;
  reservadoAte?: string;
  motivoPerda?: string;
  archivedAt?: string;
  deletedAt?: string;
}

export interface Vendedor {
  id: string;
  nome: string;
  avatar?: string;
  metaMensal?: number;
}

export type MemoriaLojaTom = "consultivo" | "direto" | "premium";

export interface ExemploMemoriaLoja {
  modelo: string;
  titulo: string;
  descricao: string;
  categoria: string;
  criadoEm: string;
}

export interface MemoriaLoja {
  tomDeVoz: MemoriaLojaTom;
  focosComerciais: string[];
  gatilhosFixos: string[];
  frasesRecorrentes: string[];
  categoriasMaisUsadas: string[];
  exemplosRecentes: ExemploMemoriaLoja[];
  atualizadoEm: string;
}

export const defaultMemoriaLoja: MemoriaLoja = {
  tomDeVoz: "consultivo",
  focosComerciais: ["financiamento", "troca", "agilidade", "confianca"],
  gatilhosFixos: [
    "Aceitamos financiamento",
    "Avaliamos seu usado na troca",
    "Fale conosco para mais informacoes",
  ],
  frasesRecorrentes: [],
  categoriasMaisUsadas: [],
  exemplosRecentes: [],
  atualizadoEm: new Date().toISOString(),
};

export type NfeStatus = "pendente" | "autorizada" | "cancelada" | "erro";

export interface NfeDestinatario {
  nome: string;
  documento: string;
  email?: string | null;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  municipio: string;
  codigoMunicipio?: string | null;
  uf: string;
  cep: string;
  indicadorInscricaoEstadual: "1" | "2" | "9";
  inscricaoEstadual?: string | null;
}

export interface NfeInfo {
  ref?: string;
  status: NfeStatus;
  numero?: string | null;
  serie?: string | null;
  chave?: string | null;
  danfeUrl?: string | null;
  xmlUrl?: string | null;
  emitidaEm?: string | null;
  canceladaEm?: string | null;
  justificativa?: string;
  erro?: string | null;
  mensagemSefaz?: string | null;
  focusStatus?: string | null;
  formaPagamento?: string | null;
  valorTotal?: number | null;
  descricaoProduto?: string | null;
  ambiente?: "homologacao" | "producao" | null;
  ultimaAtualizacaoEm?: string | null;
  destinatario?: NfeDestinatario | null;
}

export interface VendaCusto {
  custoAquisicao?: number;
  custoCarroManual?: number;
  usarCustoAutoReparo?: boolean;
  comissaoVendedor?: number;
  formaPagamento?: "avista" | "financiado";
  carroNaTroca?: boolean;
  valorTroca?: number;
}

export interface Venda {
  id: string;
  veiculoId: string;
  vendedorId: string;
  valor: number;
  data: string;
  nfe?: NfeInfo;
  custo?: VendaCusto;
}

export interface ConsultaVeicular {
  id: string;
  placa: string;
  veiculoId?: string;
  data: string;
  resultado: {
    marca: string;
    modelo: string;
    ano: string;
    cor: string;
    situacao: string;
    multas: number | null;
    debitos: string | null;
    leilao: boolean | null;
    roubo: boolean | null;
    recall?: boolean | null;
    valorFipe?: string | null;
    codigoFipe?: string | null;
    mesReferenciaFipe?: string | null;
    combustivelFipe?: string | null;
  };
}

export interface ConfiguracaoPrecos {
  pinturaPorPeca: number;
  pneuPequeno: number;
  pneuGrande: number;
  higienizacaoPequeno: number;
  higienizacaoGrande: number;
  polimentoPequeno: number;
  polimentoGrande: number;
  margemLucroPercent: number;
  telefoneLoja?: string;
}

export const defaultConfigPrecos: ConfiguracaoPrecos = {
  pinturaPorPeca: 300,
  pneuPequeno: 200,
  pneuGrande: 300,
  higienizacaoPequeno: 500,
  higienizacaoGrande: 700,
  polimentoPequeno: 250,
  polimentoGrande: 350,
  margemLucroPercent: 15,
  telefoneLoja: "",
};

export type CustoReparoCategoria =
  | "pintura"
  | "pneus"
  | "retrovisor"
  | "higienizacao"
  | "polimento"
  | "mecanica"
  | "outro";

export interface CustoReparo {
  id: string;
  veiculoId: string;
  categoria: CustoReparoCategoria;
  descricao: string;
  valor: number;
  data: string;
  criadoEm: string;
}

export type TarefaPosVendaStatus = "pendente" | "em_andamento" | "concluida";

export type TarefaPosVendaCategoria =
  | "documento"
  | "reparo"
  | "limpeza"
  | "multa"
  | "entrega"
  | "outro";

export interface TarefaPosVenda {
  id: string;
  vendaId: string;
  veiculoId: string;
  titulo: string;
  descricao?: string;
  categoria: TarefaPosVendaCategoria;
  status: TarefaPosVendaStatus;
  responsavel?: string;
  criadoEm: string;
  concluidoEm?: string;
}
