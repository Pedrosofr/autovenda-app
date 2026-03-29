import type { ConfiguracaoPrecos, CustoReparoCategoria } from "@/store/types";
import { recordUsage } from "@/components/DevUsagePanel";

const API_URL = "/api/gemini/v1/generateContent";
const MAX_VEHICLE_IMAGES = 8;
const REQUEST_TIMEOUT_MS = 60000; // Gemini pode demorar um pouco mais em visão
const RETRYABLE_STATUS = new Set([429, 500, 529]);

const BANNED_PHRASES = [
  "veiculo em bom estado geral", "bom estado geral", "bom estado",
  "bem cuidado", "muito bem cuidado", "carro conservado",
  "interior conservado", "interior bem conservado",
  "conservado", "muito conservado", "bem conservado",
  "versao conhecida por", "versão conhecida por",
  "aparenta contar com", "conjunto que costuma entregar",
  "acabamento que aparenta", "provavelmente tem",
  "deve ter", "possivelmente equipado",
  "tipico da versao", "típico da versão",
  "otima opcao", "ótima opção",
  "nao perca essa oportunidade", "não perca essa oportunidade",
  "pronto para transferir", "disponivel para avaliacao presencial",
  "estoque seleto", "melhores taxas do mercado",
  "melhores condicoes do mercado", "uso familiar ou profissional",
  "porte e performance", "acabamentos preservados",
  "manutencao em dia", "manutenção em dia",
  "pintura brilhante", "interior sem grandes desgastes",
  "espaco generoso para toda a familia",
];

export interface AIVehicleResult {
  modeloIdentificado: string;
  tituloBase: string;
  itensVisiveis: string[];
  fraseFinalCurta: string;
  fotosSugeridas: number[];
}

export interface AIDescriptionsResult {
  titulo: string;
  descricaoOlx: string;
  descricaoMarketplace: string;
  descricaoWhatsapp: string;
}

type VehicleCategory = "hatch" | "sedan" | "suv" | "pickup" | "utilitario" | "premium" | "geral";

function inferVehicleCategory(modelo: string): VehicleCategory {
  const normalized = modelo.toLowerCase();
  if (/(hilux|ranger|s10|amarok|frontier|saveiro|strada|montana|toro)/.test(normalized)) return "pickup";
  if (/(sprinter|ducato|boxer|master|daily|fiorino|kangoo|partner|doblo|van)/.test(normalized)) return "utilitario";
  if (/(compass|renegade|creta|tracker|tiggo|tiggo8|tiggo7|nivus|taos|corolla cross|t-cross|kicks|sportage|ix35|captur|hr-v|cr-v|equinox|sw4|outlander|ecosport|captiva|blazer|duster|kardian|pulse|fastback|eclipse cross|asx|territory|bronco|jeep commander|grand cherokee|defender|discovery|tucson|santa fe|sorento|carnival|pajero|pajero sport|trailblazer|traverse|trax|encore|mokka|crossfox)/.test(normalized)) return "suv";
  if (/(bmw|mercedes|audi|volvo|land rover|jaguar|lexus|porsche|mini|passat|jetta gli|fusion|commander)/.test(normalized)) return "premium";
  if (/(civic|corolla|city|versa|sentra|cruze|fusion|virtus|onix plus|prisma|hb20s|logan|yaris sedan)/.test(normalized)) return "sedan";
  if (/(onix|hb20|gol|polo|argo|mobi|kwid|208|c3|fit|march|fox|up|sandero|yaris hatch)/.test(normalized)) return "hatch";
  return "geral";
}

function categoryGuidance(category: VehicleCategory) {
  switch (category) {
    case "hatch": return "Tipo: Hatch. Tom do anuncio: pratico, economico, agil na cidade.";
    case "sedan": return "Tipo: Sedan. Tom do anuncio: confortavel, porta-malas generoso, perfil familiar ou executivo.";
    case "suv": return "Tipo: SUV. Tom do anuncio: espaco interno, altura de conducao, versatilidade cidade e estrada.";
    case "pickup": return "Tipo: Picape. Tom do anuncio: robusto, capacidade de carga, uso misto trabalho e lazer.";
    case "utilitario": return "Tipo: Utilitario comercial. Tom do anuncio: produtivo, volume de carga, operacao diaria.";
    case "premium": return "Tipo: Premium. Tom do anuncio: refinamento, tecnologia, desempenho diferenciado.";
    default: return "Tipo: indefinido. Liste apenas o que for claramente visivel nas fotos ou informado nos dados.";
  }
}

const PROMPT = `Voce e um especialista em venda de veiculos seminovos no Brasil, com foco em criar anuncios completos e uteis para lojistas. Analise as fotos e dados deste veiculo e retorne um objeto JSON funcional.

ESTRUTURA DO JSON ESPERADO:
{
  "titulo": "titulo atrativo para anuncio (maximo 60 caracteres)",
  "descricaoOlx": "descricao para OLX com itens separados por quebra de linha",
  "descricaoMarketplace": "descricao para Marketplace com itens separados por quebra de linha",
  "descricaoWhatsapp": "mensagem para WhatsApp com itens separados por quebra de linha"
}

REGRAS DE CONTEUDO:
- Use o conhecimento do modelo/versao para inferir equipamentos de serie (ex: Cruze LT tem direcao eletrica, nao hidraulica).
- Combine o que sabe do modelo com o que ve nas fotos e com os dados informados.
- Nao invente itens que nao existem na versao ou que nao estao visiveis.
- Sem emojis. Nao use frases proibidas como: "bom estado", "otima opcao", "bem conservado".

ESTRUTURA OBRIGATORIA DA DESCRICAO (nesta ordem):
1. Linha de apresentacao do veiculo (marca, modelo, versao, ano)
2. Frase curta e impactante sobre o carro (ex: "Um dos sedas mais completos do segmento.")
3. Equipamentos e diferenciais, um por linha
4. Quilometragem e valor se disponivel
5. Linha: "Aceitamos troca."
6. Linha: "Financiamento facilitado."
`;

const VEHICLE_FACTS_PROMPT = `Voce e um vistoriador profissional de veiculos seminovos no Brasil. Liste apenas o que voce VE nas fotos ou o que foi CONFIRMADO.

ESTRUTURA DO JSON ESPERADO:
{
  "modeloIdentificado": "Marca Modelo Versao",
  "tituloBase": "Marca Modelo Versao",
  "itensVisiveis": ["Ar-condicionado", "Cambio Automatico", "Multimidia", etc],
  "fotosSugeridas": [indices das 5 melhores fotos]
}

REGRAS:
- So inclua o que voce VE na foto (ex: tela no painel = Multimidia).
- Nao use catalogo ou memoria externa.
- Se nao tiver certeza, nao inclua.
`;

async function compressImage(base64: string, maxSize = 1024, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = () => resolve(base64.includes(",") ? base64.split(",")[1] : base64);
    img.src = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

export async function analyzeVehicleWithGemini(
  imageBase64: string[],
  vehicleData: {
    marca?: string;
    modelo: string;
    ano?: string;
    km?: string;
    cor?: string;
    cambio?: string;
    multimidia?: "sim" | "nao";
    opcionais?: string;
    contextoLoja?: string;
  }
): Promise<AIVehicleResult> {
  const parts: any[] = [];
  const category = inferVehicleCategory(vehicleData.modelo);

  const dataText = `${VEHICLE_FACTS_PROMPT}\n\nDADOS: ${JSON.stringify(vehicleData)}\nCATEGORIA: ${category}\n${categoryGuidance(category)}`;
  parts.push({ text: dataText });

  for (const img of imageBase64.slice(0, MAX_VEHICLE_IMAGES)) {
    const compressed = await compressImage(img);
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: compressed
      }
    });
  }

  const json = await postGeminiRequest({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    }
  });

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(text);

  return {
    modeloIdentificado: sanitizeTitle(parsed.modeloIdentificado ?? ""),
    tituloBase: sanitizeTitle(parsed.tituloBase ?? ""),
    itensVisiveis: Array.isArray(parsed.itensVisiveis)
      ? parsed.itensVisiveis
          .filter((i: any) => typeof i === 'string')
          .map((i: string) => postFilterGeneratedText(sanitizeGeneratedText(i)))
          .filter(Boolean)
          .slice(0, 14)
      : [],
    fraseFinalCurta: "",
    fotosSugeridas: Array.isArray(parsed.fotosSugeridas) ? parsed.fotosSugeridas.map(Number).filter(n => !isNaN(n)) : [0,1,2,3,4]
  };
}

export async function generateVehicleDescriptionsWithGemini(
  imageBase64: string[],
  vehicleData: {
    marca?: string;
    modelo: string;
    ano?: string;
    km?: string;
    cor?: string;
    cambio?: string;
    valorVenda?: string;
    multimidia?: "sim" | "nao";
    opcionais?: string;
    contextoLoja?: string;
  }
): Promise<AIDescriptionsResult> {
  const parts: any[] = [];
  const category = inferVehicleCategory(vehicleData.modelo);

  const dataText = `${PROMPT}\n\nDADOS: ${JSON.stringify(vehicleData)}\nCATEGORIA: ${category}\n${categoryGuidance(category)}`;
  parts.push({ text: dataText });

  for (const img of imageBase64.slice(0, MAX_VEHICLE_IMAGES)) {
    const compressed = await compressImage(img);
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: compressed
      }
    });
  }

  const json = await postGeminiRequest({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    }
  });

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(text);

  const sanitize = (v: string) => postFilterGeneratedText(sanitizeGeneratedText(v ?? ""));

  return {
    titulo: sanitizeTitle(parsed.titulo ?? ""),
    descricaoOlx: sanitize(parsed.descricaoOlx ?? ""),
    descricaoMarketplace: sanitize(parsed.descricaoMarketplace ?? ""),
    descricaoWhatsapp: formatWhatsappText(sanitize(parsed.descricaoWhatsapp ?? "")),
  };
}

// Aliases para manter compatibilidade com Estoque.tsx
export const analyzeVehicleWithClaude = analyzeVehicleWithGemini;
export const generateVehicleDescriptions = generateVehicleDescriptionsWithGemini;

async function postGeminiRequest(body: any) {
  const res = await fetch(API_URL, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Gemini] ${res.status}: ${err}`);
    throw new Error("Falha ao gerar conteudo com IA. Tente novamente.");
  }

  return res.json();
}

function sanitizeTitle(value: string) {
  return sanitizeGeneratedText(value).replace(/\s{2,}/g, " ").trim();
}

function sanitizeGeneratedText(value: string) {
  if (!value) return "";
  return value.replace(/\r/g, "").replace(/\s{2,}/g, " ").trim();
}

function postFilterGeneratedText(value: string) {
  return value.split("\n").filter(l => !BANNED_PHRASES.some(p => l.toLowerCase().includes(p))).join("\n").trim();
}

function formatWhatsappText(value: string) {
  return value.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 5).join("\n");
}

export async function estimarCustosVeiculo(params: any) {
  // Implementação simplificada para o Gemini ou manter lógica via json
  const prompt = `Estime custos de reparo para ${params.modelo} ${params.ano} comprado por R$ ${params.custoCompra} (FIPE: R$ ${params.valorFipe}).
  Use os precos: Pintura R$ ${params.config.pinturaPorPeca}, Pneu R$ ${params.config.pneuPequeno}, Higienizacao R$ ${params.config.higienizacaoPequeno}.
  Retorne JSON: { tamanho, reparos: [{categoria, descricao, quantidade, valorUnitario, valorTotal}], totalReparos, custoTotal, precoVendaSugerido, lucroEstimado, margemPercent, justificativa }`;

  const json = await postGeminiRequest({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  });

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.reparos)) {
    throw new Error("Resposta da IA em formato inesperado.");
  }
  return parsed;
}
