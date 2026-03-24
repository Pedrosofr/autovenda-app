// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  addConsulta: vi.fn(),
  fetchVeiculoByPlaca: vi.fn(),
  fetchFipeByText: vi.fn(),
  fetchFipeBrandSuggestions: vi.fn(),
  fetchFipeModelSuggestions: vi.fn(),
}));

vi.mock("@/store/appStore", () => ({
  useAppStore: () => ({
    veiculos: [],
    addConsulta: mocks.addConsulta,
  }),
}));

vi.mock("@/services/brasilapi", () => ({
  fetchVeiculoByPlaca: mocks.fetchVeiculoByPlaca,
}));

vi.mock("@/services/fipe", () => ({
  fetchFipeByText: mocks.fetchFipeByText,
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

    mocks.fetchVeiculoByPlaca.mockResolvedValue({
      placa: "ABC-1D23",
      placaConsultada: "ABC-1D23",
      marca: "Volkswagen",
      modelo: "Gol 1.0 Flex 12V 5p",
      ano: "2019",
      cor: "Branco",
      situacao: "Regular",
      municipio: "Sao Paulo",
      uf: "SP",
      source: "sinesp-api",
    });

    mocks.fetchFipeByText.mockResolvedValue({
      valor: "R$ 40.142,00",
      marca: "VW - VolksWagen",
      modelo: "Gol 1.0 Flex 12V 5p",
      anoModelo: 2019,
      combustivel: "Flex",
      codigoFipe: "005490-9",
      mesReferencia: "marco de 2026",
      tipoVeiculo: 1,
      siglaCombustivel: "F",
      dataConsulta: "domingo, 22 de marco de 2026 15:32",
      source: "fipe-oficial",
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

  it("shows FIPE data after a successful plate lookup", async () => {
    render(<ConsultaVeicular />);

    fireEvent.change(screen.getByPlaceholderText("ABC-1234 ou ABC-1D23"), {
      target: { value: "abc1d23" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText("FIPE")).toBeInTheDocument();
    expect(await screen.findByText("R$ 40.142,00")).toBeInTheDocument();
    expect(screen.getByText("005490-9")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.fetchFipeByText).toHaveBeenCalledWith(
        "Volkswagen",
        "Gol 1.0 Flex 12V 5p",
        "2019",
      );
    });
  });

  it("allows manual FIPE lookup without depending on the plate provider", async () => {
    render(<ConsultaVeicular />);

    fireEvent.change(screen.getByPlaceholderText("Ex.: Volkswagen"), {
      target: { value: "Volkswagen" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ex.: Gol 1.0 Flex"), {
      target: { value: "Gol 1.0 Flex 12V 5p" },
    });
    fireEvent.change(screen.getByPlaceholderText("Ex.: 2019"), {
      target: { value: "2019" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Consultar FIPE" }));

    expect(await screen.findByText("R$ 40.142,00")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.fetchFipeByText).toHaveBeenCalledWith(
        "Volkswagen",
        "Gol 1.0 Flex 12V 5p",
        "2019",
      );
    });
  });

  it("shows clickable FIPE suggestions while typing brand and model", async () => {
    render(<ConsultaVeicular />);

    fireEvent.change(screen.getByPlaceholderText("Ex.: Volkswagen"), {
      target: { value: "vol" },
    });

    const brandSuggestion = await screen.findByRole("button", {
      name: "Volkswagen",
    });
    fireEvent.click(brandSuggestion);

    expect(screen.getByPlaceholderText("Ex.: Volkswagen")).toHaveValue("Volkswagen");

    fireEvent.change(screen.getByPlaceholderText("Ex.: Gol 1.0 Flex"), {
      target: { value: "voy" },
    });

    const modelSuggestion = await screen.findByRole("button", {
      name: "Voyage 1.6 MSI Flex 16V 4p Aut.",
    });
    fireEvent.click(modelSuggestion);

    expect(screen.getByPlaceholderText("Ex.: Gol 1.0 Flex")).toHaveValue(
      "Voyage 1.6 MSI Flex 16V 4p Aut.",
    );
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    expect(
      screen.queryByRole("button", {
        name: "Voyage 1.6 MSI Flex 16V 4p Aut.",
      }),
    ).not.toBeInTheDocument();
  });
});
