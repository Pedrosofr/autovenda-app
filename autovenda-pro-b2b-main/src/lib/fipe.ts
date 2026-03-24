type FipeOption = {
  label: string;
  value: string | number;
};

const STOPWORDS = new Set([
  "de",
  "do",
  "da",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "mi",
]);

const BRAND_ALIASES: Record<string, string[]> = {
  volkswagen: [
    "vw",
    "volkswagen",
    "volks",
    "volksvagen",
    "volksvagem",
    "volkvagem",
    "volkwagen",
    "wolkswagen",
  ],
  chevrolet: ["gm", "chevrolet"],
  citroen: ["citroen"],
};

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeFipeText(value: string) {
  return stripDiacritics(value)
    .toLowerCase()
    // Split compact inputs like "voyage1.6" into searchable tokens.
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeFipeText(value)
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token));
}

function tokenOverlapScore(queryTokens: string[], candidateTokens: string[]) {
  let score = 0;

  for (const token of queryTokens) {
    if (candidateTokens.includes(token)) {
      score += token.length >= 4 ? 7 : 3;
      continue;
    }

    if (candidateTokens.some((candidate) => candidate.includes(token) || token.includes(candidate))) {
      score += token.length >= 4 ? 4 : 2;
    }
  }

  return score;
}

function scoreOption(query: string, candidate: string) {
  const normalizedQuery = normalizeFipeText(query);
  const normalizedCandidate = normalizeFipeText(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  let score = 0;

  if (normalizedQuery === normalizedCandidate) {
    score += 100;
  } else if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    score += 45;
  }

  score += tokenOverlapScore(tokenize(query), tokenize(candidate));

  const queryHead = tokenize(query)[0];
  const candidateHead = tokenize(candidate)[0];
  if (queryHead && candidateHead && queryHead === candidateHead) {
    score += 10;
  }

  return score;
}

function expandBrandQuery(marca: string, modelo: string) {
  const base = normalizeFipeText(`${marca} ${modelo}`);
  const queries = new Set<string>([base, normalizeFipeText(marca)]);

  Object.entries(BRAND_ALIASES).forEach(([canonical, aliases]) => {
    if (aliases.some((alias) => base.includes(alias))) {
      queries.add(canonical);
      aliases.forEach((alias) => queries.add(alias));
    }
  });

  return Array.from(queries).filter(Boolean);
}

export function pickBestFipeBrand<T extends FipeOption>(brands: T[], marca: string, modelo: string) {
  const queries = expandBrandQuery(marca, modelo);
  let best: { item: T; score: number } | null = null;

  for (const item of brands) {
    const candidateLabel = String(item.label);
    const score = Math.max(...queries.map((query) => scoreOption(query, candidateLabel)));
    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best && best.score > 0 ? best.item : null;
}

export function pickBestFipeModel<T extends FipeOption>(models: T[], modelo: string) {
  let best: { item: T; score: number } | null = null;

  for (const item of models) {
    const score = scoreOption(modelo, String(item.label));
    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best && best.score >= 10 ? best.item : null;
}

function inferFuelPreference(modelo: string) {
  const normalized = normalizeFipeText(modelo);

  if (/(diesel|tdi|hdi|dci|cdi)\b/.test(normalized)) return "diesel";
  if (/(hibrido|hibrida|hybrid|hev|phev)\b/.test(normalized)) return "hibrido";
  if (/(alcool|etanol)\b/.test(normalized)) return "alcool";
  if (/(flex|total flex|t flex|e flex)\b/.test(normalized)) return "flex";
  return "flex";
}

const FUEL_SCORE: Record<string, string[]> = {
  diesel: ["diesel"],
  hibrido: ["hibrido"],
  alcool: ["alcool"],
  flex: ["flex", "gasolina"],
};

export function pickBestFipeYear<T extends FipeOption>(years: T[], ano: string, modelo: string) {
  const targetYear = (ano.match(/\d{4}/)?.[0] ?? "").trim();
  const fuelPreference = inferFuelPreference(modelo);

  const candidates = years.filter((item) => {
    if (!targetYear) return true;
    return normalizeFipeText(String(item.label)).startsWith(targetYear);
  });

  if (!candidates.length) {
    return null;
  }

  const preferredFuelOrder = FUEL_SCORE[fuelPreference] ?? ["flex", "gasolina", "diesel", "alcool", "hibrido"];

  for (const fuel of preferredFuelOrder) {
    const match = candidates.find((item) => normalizeFipeText(String(item.label)).includes(fuel));
    if (match) return match;
  }

  return candidates[0];
}
