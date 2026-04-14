// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  addConsulta: vi.fn(),
  executeConsultation: vi.fn(),
  fetchFipeBrandSuggestions: vi.fn(),
  fetchFipeModelSuggestions: vi.fn(),
}));

vi.mock("@/store/appStore", () => ({
  useAppStore: () => ({
    veiculos: [{ id: "veh-1", modelo: "Gol", ano: "2019", status: "disponivel" }],
    addConsulta: mocks.addConsulta,
  }),
}));

vi.mock("@/services/consultas", () => ({
  executeConsultation: mocks.executeConsultation,
}));

vi.mock("@/services/fipe", () => ({
  fetchFipeBrandSuggestions: mocks.fetchFipeBrandSuggestions,
  fetchFipeModelSuggestions: mocks.fetchFipeModelSuggestions,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import ConsultaVeicular from "@/pages/ConsultaVeicular";

describe("ConsultaVeicular", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.executeConsultation.mockResolvedValue({
      query: { plate: "ABC1D23" },
      requestedModuleIds: ["completa"],
      expandedModuleIds: ["placa", "fipe", "leilao", "multas", "debitos", "roubo_furto"],
      totalPriceCents: 4990,
      vehicle: {
        placa: "ABC-1D23",
        placaConsultada: "ABC-1D23",
        marca: "Volkswagen",
        modelo: "Gol 1.0 Flex 12V 5p",
        ano: "2019",
        cor: "Branco",
        situacao: "Regular",
      },
      results: [
        {
          moduleId: "placa",
          title: "Consulta por placa",
          priceCents: 1290,
          providerKey: "sinesp-api",
          status: "completed",
          executedAt: "2026-04-13T17:00:00.000Z",
          data: {
            placa: "ABC-1D23",
            marca: "Volkswagen",
            modelo: "Gol 1.0 Flex 12V 5p",
            situacao: "Regular",
          },
        },
        {
          moduleId: "fipe",
          title: "Tabela FIPE",
          priceCents: 490,
          providerKey: "fipe-oficial",
          status: "completed",
          executedAt: "2026-04-13T17:00:01.000Z",
          data: {
            valor: "R$ 40.142,00",
            codigoFipe: "005490-9",
            anoModelo: 2019,
            combustivel: "Flex",
          },
        },
        {
          moduleId: "leilao",
          title: "Historico de leilao",
          priceCents: 1490,
          providerKey: "pending-provider",
          status: "pending_integration",
          executedAt: "2026-04-13T17:00:02.000Z",
          message: "Modulo preparado para integrar API externa sem retrabalhar a tela.",
        },
      ],
    });

    mocks.fetchFipeBrandSuggestions.mockResolvedValue([
      { label: "Volkswagen", value: "59" },
      { label: "Volvo", value: "58" },
    ]);

    mocks.fetchFipeModelSuggestions.mockResolvedValue([
      { label: "Voyage 1.6 MSI Flex 16V 4p Aut.", value: "005501-8" },
      { label: "Voyage 1.0 Flex 12V 4p", value: "005490-9" },
    ]);
  });

  it("executes the modular consultation flow and renders module results", async () => {
    render(<ConsultaVeicular />);

    fireEvent.change(screen.getByPlaceholderText("ABC-1234 ou ABC-1D23"), {
      target: { value: "abc1d23" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Executar consulta/i }));

    expect(await screen.findByText("Consulta por placa")).toBeInTheDocument();
    expect(await screen.findByText("R$ 40.142,00")).toBeInTheDocument();
    expect(screen.getByText("Pronto para API")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.executeConsultation).toHaveBeenCalledWith(
        expect.objectContaining({
          plate: "ABC-1D23",
          moduleIds: ["completa"],
        }),
      );
    });
  });

  it("allows FIPE base input suggestions while typing", async () => {
    render(<ConsultaVeicular />);

    fireEvent.change(screen.getByPlaceholderText("Ex.: Volkswagen"), {
      target: { value: "vol" },
    });

    const brandSuggestion = await screen.findByRole("button", { name: "Volkswagen" });
    fireEvent.click(brandSuggestion);
    expect(screen.getByPlaceholderText("Ex.: Volkswagen")).toHaveValue("Volkswagen");

    fireEvent.change(screen.getByPlaceholderText("Ex.: Gol 1.0 Flex"), {
      target: { value: "voy" },
    });

    const modelSuggestion = await screen.findByRole("button", { name: "Voyage 1.6 MSI Flex 16V 4p Aut." });
    fireEvent.click(modelSuggestion);
    expect(screen.getByPlaceholderText("Ex.: Gol 1.0 Flex")).toHaveValue("Voyage 1.6 MSI Flex 16V 4p Aut.");
  });

  it("saves a completed consultation into the store history", async () => {
    render(<ConsultaVeicular />);

    fireEvent.change(screen.getByPlaceholderText("ABC-1234 ou ABC-1D23"), {
      target: { value: "abc1d23" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Executar consulta/i }));

    expect(await screen.findByRole("button", { name: /Salvar consulta/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Salvar consulta/i }));

    await waitFor(() => {
      expect(mocks.addConsulta).toHaveBeenCalledWith(
        expect.objectContaining({
          placa: "ABC-1D23",
          moduleIds: ["completa"],
          totalPriceCents: 4990,
        }),
      );
    });
  });
});
