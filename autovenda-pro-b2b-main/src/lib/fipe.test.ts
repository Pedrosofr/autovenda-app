import { describe, expect, it } from "vitest";
import {
  pickBestFipeBrand,
  pickBestFipeModel,
  pickBestFipeYear,
} from "@/lib/fipe";

describe("fipe helpers", () => {
  it("matches brand aliases like Volkswagen and GM", () => {
    const brands = [
      { label: "VW - VolksWagen", value: "59" },
      { label: "GM - Chevrolet", value: "23" },
      { label: "Fiat", value: "21" },
    ];

    expect(pickBestFipeBrand(brands, "Volkswagen", "Gol 1.0 Flex")).toEqual({
      label: "VW - VolksWagen",
      value: "59",
    });

    expect(pickBestFipeBrand(brands, "Chevrolet", "Onix 1.0 Turbo")).toEqual({
      label: "GM - Chevrolet",
      value: "23",
    });
  });

  it("matches common brand typos like volkvagem", () => {
    const brands = [
      { label: "VW - VolksWagen", value: "59" },
      { label: "GM - Chevrolet", value: "23" },
    ];

    expect(pickBestFipeBrand(brands, "volkvagem", "voyage1.6")).toEqual({
      label: "VW - VolksWagen",
      value: "59",
    });
  });

  it("prefers the closest model candidate by normalized token match", () => {
    const models = [
      { label: "Gol 1.0 Trend/ Power 8V 4p", value: "2388" },
      { label: "Gol 1.0 Flex 12V 5p", value: "8323" },
      { label: "Gol 1.0 Mi Plus 8v 4p", value: "2385" },
    ];

    expect(pickBestFipeModel(models, "Gol 1.0 Flex 12V 5p")).toEqual({
      label: "Gol 1.0 Flex 12V 5p",
      value: "8323",
    });
  });

  it("matches compact model text without spaces between letters and numbers", () => {
    const models = [
      { label: "Voyage 1.0 Flex 12V 4p", value: "8311" },
      { label: "Voyage 1.6 MSI Flex 8V 4p", value: "9799" },
      { label: "Voyage 1.6 Comfortline Flex 8V 4p", value: "9801" },
    ];

    expect(pickBestFipeModel(models, "voyage1.6")).toEqual({
      label: "Voyage 1.6 MSI Flex 8V 4p",
      value: "9799",
    });
  });

  it("chooses the year entry that matches inferred fuel from the model text", () => {
    const years = [
      { label: "2019 Gasolina", value: "2019-1" },
      { label: "2019 Flex", value: "2019-5" },
      { label: "2019 Diesel", value: "2019-3" },
    ];

    expect(pickBestFipeYear(years, "2019", "Gol 1.0 Flex 12V 5p")).toEqual({
      label: "2019 Flex",
      value: "2019-5",
    });

    expect(pickBestFipeYear(years, "2019", "Amarok 2.0 TDI Diesel")).toEqual({
      label: "2019 Diesel",
      value: "2019-3",
    });
  });
});
