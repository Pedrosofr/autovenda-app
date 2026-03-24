import { describe, expect, it } from "vitest";
import {
  formatPlate,
  getPlateCandidates,
  isLegacyPlate,
  isMercosulPlate,
  isValidPlate,
  legacyToMercosul,
  mercosulToLegacy,
  normalizePlate,
} from "@/lib/placa";

describe("placa helpers", () => {
  it("normalizes and formats legacy plates", () => {
    expect(normalizePlate("abc-1234")).toBe("ABC1234");
    expect(formatPlate("abc-1234")).toBe("ABC-1234");
    expect(isLegacyPlate("ABC-1234")).toBe(true);
    expect(isValidPlate("ABC-1234")).toBe(true);
  });

  it("normalizes and formats mercosul plates", () => {
    expect(normalizePlate("abc1d23")).toBe("ABC1D23");
    expect(formatPlate("abc1d23")).toBe("ABC-1D23");
    expect(isMercosulPlate("ABC-1D23")).toBe(true);
    expect(isValidPlate("ABC-1D23")).toBe(true);
  });

  it("converts between legacy and mercosul candidates", () => {
    expect(legacyToMercosul("ABC-1234")).toBe("ABC1C34");
    expect(mercosulToLegacy("ABC-1C34")).toBe("ABC1234");
    expect(getPlateCandidates("ABC-1234")).toEqual(["ABC1234", "ABC1C34"]);
    expect(getPlateCandidates("ABC-1C34")).toEqual(["ABC1C34", "ABC1234"]);
  });

  it("rejects invalid plates", () => {
    expect(isValidPlate("AB-1234")).toBe(false);
    expect(isValidPlate("ABCDEFG")).toBe(false);
    expect(isValidPlate("1234567")).toBe(false);
  });
});
