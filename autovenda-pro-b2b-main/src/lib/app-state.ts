import type {
  ConfiguracaoPrecos,
  ConsultaVeicular,
  CustoReparo,
  Lead,
  MemoriaLoja,
  TarefaPosVenda,
  Veiculo,
  Venda,
  Vendedor,
} from "../store/types";
import { defaultConfigPrecos, defaultMemoriaLoja } from "../store/types";

export interface AppStateSnapshot {
  veiculos: Veiculo[];
  leads: Lead[];
  vendedores: Vendedor[];
  vendas: Venda[];
  consultas: ConsultaVeicular[];
  tarefasPosVenda: TarefaPosVenda[];
  custos: CustoReparo[];
  configPrecos: ConfiguracaoPrecos;
  memoriaLoja: MemoriaLoja;
}

export type AppStateResourcePatch = Partial<
  Omit<AppStateSnapshot, "vendedores">
>;

export function createEmptyAppState(overrides?: Partial<AppStateSnapshot>): AppStateSnapshot {
  return {
    veiculos: [],
    leads: [],
    vendedores: [],
    vendas: [],
    consultas: [],
    tarefasPosVenda: [],
    custos: [],
    configPrecos: { ...defaultConfigPrecos },
    memoriaLoja: { ...defaultMemoriaLoja },
    ...overrides,
  };
}
