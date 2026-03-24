const MERCOSUL_LETTER_TO_DIGIT: Record<string, string> = {
  A: "0",
  B: "1",
  C: "2",
  D: "3",
  E: "4",
  F: "5",
  G: "6",
  H: "7",
  I: "8",
  J: "9",
};

const DIGIT_TO_MERCOSUL_LETTER: Record<string, string> = Object.fromEntries(
  Object.entries(MERCOSUL_LETTER_TO_DIGIT).map(([letter, digit]) => [digit, letter]),
) as Record<string, string>;

const LEGACY_PLATE_REGEX = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function normalizePlate(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 7);
}

export function isLegacyPlate(value: string) {
  return LEGACY_PLATE_REGEX.test(normalizePlate(value));
}

export function isMercosulPlate(value: string) {
  return MERCOSUL_PLATE_REGEX.test(normalizePlate(value));
}

export function isValidPlate(value: string) {
  const normalized = normalizePlate(value);
  return LEGACY_PLATE_REGEX.test(normalized) || MERCOSUL_PLATE_REGEX.test(normalized);
}

export function formatPlate(value: string) {
  const normalized = normalizePlate(value);
  if (normalized.length <= 3) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

export function mercosulToLegacy(value: string) {
  const normalized = normalizePlate(value);
  if (!isMercosulPlate(normalized)) return normalized;

  const convertedDigit = MERCOSUL_LETTER_TO_DIGIT[normalized[4]];
  if (convertedDigit === undefined) return normalized;

  return `${normalized.slice(0, 4)}${convertedDigit}${normalized.slice(5)}`;
}

export function legacyToMercosul(value: string) {
  const normalized = normalizePlate(value);
  if (!isLegacyPlate(normalized)) return normalized;

  const convertedLetter = DIGIT_TO_MERCOSUL_LETTER[normalized[4]];
  if (convertedLetter === undefined) return normalized;

  return `${normalized.slice(0, 4)}${convertedLetter}${normalized.slice(5)}`;
}

export function getPlateCandidates(value: string) {
  const normalized = normalizePlate(value);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  if (isMercosulPlate(normalized)) {
    candidates.add(mercosulToLegacy(normalized));
  }
  if (isLegacyPlate(normalized)) {
    candidates.add(legacyToMercosul(normalized));
  }

  return Array.from(candidates);
}
