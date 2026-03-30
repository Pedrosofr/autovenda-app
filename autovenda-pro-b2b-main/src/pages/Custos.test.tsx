// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const storeMocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  estimarCustosVeiculo: vi.fn(),
}));

vi.mock("@/store/appStore", () => ({
  useAppStore: () => storeMocks.state,
}));

vi.mock("@/services/gemini", () => ({
  estimarCustosVeiculo: storeMocks.estimarCustosVeiculo,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import Custos from "@/pages/Custos";
import { defaultConfigPrecos } from "@/store/types";

function createStoreState(overrides?: Partial<Record<string, unknown>>) {
  return {
    veiculos: [
      {
        id: "veiculo-1",
        modelo: "Onix LT",
        ano: "2022",
        custo: "50000",
        valorVenda: "62000",
        fotos: [],
        fotosDestaque: [],
        status: "disponivel" as const,
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    ],
    custos: [],
    addCusto: vi.fn(),
    removeCusto: vi.fn(),
    configPrecos: defaultConfigPrecos,
    updateConfigPrecos: vi.fn(),
    updateVeiculo: vi.fn(),
    ...overrides,
  };
}

describe("Custos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not list stock vehicles automatically when they were not added to the costs tab", () => {
    storeMocks.state = createStoreState();

    render(<Custos />);

    expect(screen.queryByText("Onix LT")).not.toBeInTheDocument();
  });

  it("shows a vehicle after it is explicitly linked to the costs tab", () => {
    storeMocks.state = createStoreState({
      veiculos: [
        {
          id: "veiculo-1",
          modelo: "Onix LT",
          ano: "2022",
          custo: "50000",
          valorVenda: "62000",
          fotos: [],
          fotosDestaque: [],
          custosAtivo: true,
          status: "disponivel" as const,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
      ],
    });

    render(<Custos />);

    expect(screen.getByText("Onix LT")).toBeInTheDocument();
  });
});
