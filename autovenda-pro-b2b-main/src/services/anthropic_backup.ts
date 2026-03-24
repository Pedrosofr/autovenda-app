import type { ConfiguracaoPrecos, CustoReparoCategoria } from "@/store/types";
import { recordUsage } from "@/components/DevUsagePanel";

const API_URL = "/api/anthropic/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_VEHICLE_IMAGES = 8;
const REQUEST_TIMEOUT_MS = 45000;
const RETRYABLE_STATUS = new Set([429, 500, 529]);
// Frases proibidas: inferências de catálogo, elogios genéricos e frases de vendedor barato
const BANNED_PHRASES = [
  // Estado genérico sem prova
  "veiculo em bom estado geral", "bom estado geral", "bom estado",
  "bem cuidado", "muito bem cuidado", "carro conservado",
  "interior conservado", "interior bem conservado",
  "conservado", "muito conservado", "bem conservado",
  // Inferência de catálogo
  "versao conhecida por", "versão conhecida por",
  "aparenta contar com", "conjunto que costuma entregar",
  "acabamento que aparenta", "provavelmente tem",
  "deve ter", "possivelmente equipado",
  "tipico da versao", "típico da versão",
  // Frases de vendedor genérico
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
    case "hatch":
      return "Tipo: Hatch. Tom do anuncio: pratico, economico, agil na cidade.";
    case "sedan":
      return "Tipo: Sedan. Tom do anuncio: confortavel, porta-malas generoso, perfil familiar ou executivo.";
    case "suv":
      return "Tipo: SUV. Tom do anuncio: espaco interno, altura de conducao, versatilidade cidade e estrada.";
    case "pickup":
      return "Tipo: Picape. Tom do anuncio: robusto, capacidade de carga, uso misto trabalho e lazer.";
    case "utilitario":
      return "Tipo: Utilitario comercial. Tom do anuncio: produtivo, volume de carga, operacao diaria.";
    case "premium":
      return "Tipo: Premium. Tom do anuncio: refinamento, tecnologia, desempenho diferenciado.";
    default:
      return "Tipo: indefinido. Liste apenas o que for claramente visivel nas fotos ou informado nos dados.";
  }
}

const PROMPT = `Voce e um especialista em venda de veiculos seminovos no Brasil, com foco em criar anuncios completos, persuasivos e uteis para lojistas. Analise as fotos e dados deste veiculo e retorne APENAS um JSON valido, sem markdown, com as chaves exatas:

{
  "titulo": "titulo atrativo para anuncio (maximo 60 caracteres)",
  "descricaoOlx": "descricao curta para OLX (120-220 palavras, comercial e objetiva)",
  "descricaoMarketplace": "descricao curta para Marketplace, em formato seco e facil de bater o olho",
  "descricaoWhatsapp": "mensagem curta para WhatsApp (3-5 linhas, comercial e objetiva)",
  "fotosSugeridas": [indices 0-based das 5 melhores fotos para destaque, ordenadas por qualidade e angulo]
}

IMPORTANTE:
- Use como referencia mental um estilo real de Marketplace brasileiro:
  exemplo 1: modelo/versao/ano, km, preco, lista curta de itens e fechamento com contato;
  exemplo 2: nome forte no topo, km e FIPE/venda, itens em linhas curtas e "financiamento facilitado";
  exemplo 3: frases bem curtas, foco em estado visual e mecanico, "aceita troca" e "financia".
- O texto final deve lembrar esse estilo objetivo de anuncio real, mas sem copiar literalmente nenhum exemplo.
- Escreva como uma loja profissional brasileira de verdade. Nada de texto com cara de IA, nada de exagero, nada de marketing barato.
- Nao use emojis.
- Nao encha o texto com listas longas, bullets ou hashtags demais. O resultado deve ser limpo, comercial e facil de copiar para anuncio.
- Escreva como ficha curta de anuncio, nao como paragrafo de vendedor.
- Priorize linhas curtas que batem o olho rapido no celular.
- Evite completamente frases vagas e sem valor como:
  "veiculo em bom estado geral"
  "otima opcao"
  "espaco generoso para toda a familia"
  "pintura brilhante"
  "interior sem grandes desgastes"
  "disponivel para avaliacao presencial"
  "pronto para transferir"
  "nao perca essa oportunidade"
- A descricaoOlx precisa parecer um anuncio pronto para venda, nao um texto generico.
- A descricaoOlx deve ser curta, direta e facil de copiar. Nao escreva texto longo.
- A descricaoOlx deve seguir formato parecido com:
  nome do carro
  ano, km e valor
  itens principais em linhas curtas
  1 frase final curta
- A descricaoMarketplace deve seguir estilo real de anuncio de Marketplace:
  modelo/versao/ano no topo
  preco e km quando houver
  poucas linhas com itens principais
  fechamento curto com financiamento e troca
- A descricaoMarketplace deve ser mais seca que a descricaoOlx.
- A descricaoMarketplace deve soar como um anuncio de vendedor, com blocos curtos e informacao util primeiro.
- Cruze as fotos com os dados estruturados do veiculo, especialmente modelo e ano, para identificar carroceria, versao provavel, acabamento e argumentos de venda mais corretos.
- Quando o nome do carro permitir mais de uma carroceria ou configuracao, use as fotos para ajudar a diferenciar. Exemplo: Onix hatch x Onix Plus sedan.
- Se os dados escritos parecerem apenas referencia, rascunho, exemplo ou vierem incompletos, priorize o veiculo que aparece nas fotos.
- Se houver divergencia entre o modelo digitado e o carro visto nas imagens, NAO trave a resposta e NAO interrompa o fluxo. Gere o anuncio com base no veiculo que voce identifica visualmente nas fotos.
- Quando existir divergencia, ajuste o titulo e a descricao para o carro visualmente identificado, sem depender cegamente do texto digitado.
- Adapte o texto ao tipo de veiculo: hatch, sedan, suv, pickup, utilitario ou premium.
- Use as fotos para complementar cor, acabamento, estado visual, limpeza, conservacao e impressao geral.
- Observe com atencao itens e pistas visuais nas imagens, como: multimidia, camera de re, volante multifuncional, tipo de painel, bancos, acabamento interno, rodas, farois, LED, farol de neblina, sensor, retrovisores, console, comandos e detalhes da cabine.
- Se algum item estiver claramente visivel, voce pode citar com seguranca no texto.
- Se o item for apenas provavel pela versao ou pela imagem, use formulacoes prudentes como "aparenta contar com", "as fotos indicam", "a configuracao sugere", "versao conhecida por oferecer".
- So informe a versao exata, motorizacao, cambio, pacote ou nome comercial completo se houver base forte e coerente nas imagens e no nome informado.
- Se nao houver base suficiente, prefira algo mais seguro como "Chevrolet Captiva automatica" ou "SUV da linha Captiva", sem inventar "Sport 2.4 FWD" ou detalhes finos.
- Nao invente itens tecnicos nao confirmados como numero de airbags, tipo de direcao, pacote de seguranca, motor, cilindrada, tracao ou opcionais de fabrica.
- Nao use conhecimento de catalogo ou memoria do modelo para completar motor, numero de lugares, tipo de direcao, banco eletrico, tracao ou configuracao mecanica se isso nao vier claramente dos dados ou das fotos.
- Se o dado nao estiver visivel nem informado, omita. Omitir e melhor do que chutar.
- Itens fortes de venda como 7 lugares, teto solar, bancos em couro, multimidia, camera de re, farol em LED, farol de neblina e comandos no volante DEVEM aparecer quando estiverem visiveis nas fotos ou claramente confirmados pelos dados.
- Se nao houver prova visual ou textual suficiente, nao invente esses itens.
- Nunca afirme "melhores taxas", "manutencao em dia", "acabamentos preservados" ou frases parecidas sem prova concreta.
- Estruture a descricaoOlx de forma natural, incluindo:
  1. abertura comercial forte,
  2. descricao do modelo/versao/ano e tipo de carroceria quando fizer sentido,
  3. pontos fortes do carro para uso real,
  4. equipamentos e diferenciais visiveis ou provaveis da versao,
  5. leitura visual do estado do veiculo pelas fotos,
  6. fechamento com CTA claro.
- Inclua de forma natural no texto comercial informacoes como possibilidade de financiamento, avaliacao do usado na troca e apoio no atendimento, a menos que o contexto da loja contradiga isso.
- O fechamento deve convidar o cliente para chamar no WhatsApp, agendar visita ou pedir simulacao.
- Quando alguma informacao nao puder ser confirmada pela foto, use formulacoes prudentes como "versao conhecida por oferecer", "conjunto que costuma entregar", "acabamento que aparenta".
- Nao invente acessorios extremamente especificos sem base no nome da versao ou indicio visual.
- Evite frases vazias como "carro top", "imperdivel" ou "aproveite". Escreva como uma loja profissional.
- A descricao deve ser util para vender mais rapido, destacando os pontos que importam para aquele perfil de carro.
- A mensagem de WhatsApp deve resumir bem o carro, citar financiamento/troca quando fizer sentido e convidar para continuar a conversa sem parecer robatica.
- Respeite o contexto da loja para estilo de escrita, posicionamento e tom comercial.
- O titulo deve sair com cara de anuncio forte e profissional, evitando excesso de pontuacao e clickbait.
- Nao responda pedindo confirmacao antes de gerar o anuncio. Gere o melhor resultado possivel com base no conjunto visual e textual, dando prioridade ao que for mais confiavel.
- O titulo deve ser curto, limpo e vendavel. Nada de "elegante", "imperdivel", "financiamos" ou outros excessos no titulo.
- A descricaoOlx deve ter no maximo 3 paragrafos curtos.
- A descricaoWhatsapp deve ser curta, direta e humana, sem parecer panfleto.
- Prefira frases curtas, concretas e informativas.
- Prefira estrutura de anuncio real:
  linha inicial com nome do carro
  linhas curtas com km/preco quando houver
  itens em destaque bem objetivos
  fechamento curto com financiamento, troca e contato
- Em vez de elogio genérico, descreva o que a foto mostra: cor, carroceria, cambio, multimidia, bancos, acabamento, rodas, painel, porta-malas, fileiras de banco, etc.
- Se nao houver detalhe visual relevante suficiente, seja simples. Nao invente floreio para preencher texto.
- Nao mencione "avaliacao presencial", "estoque seleto", "SUV para a familia" ou frases de vendedor genérico.
- Nunca escreva literalmente nenhuma das frases proibidas acima.

Dados do veiculo:
`;

const VEHICLE_FACTS_PROMPT = `Voce e um especialista em anuncios de veiculos seminovos no Brasil. Seu trabalho e igual ao de um vistoriador profissional: listar apenas o que voce VE nas fotos ou o que o vendedor CONFIRMOU nos dados. Nada alem disso.

Retorne APENAS um JSON valido, sem markdown:

{
  "modeloIdentificado": "Marca Modelo Versao identificados",
  "tituloBase": "Marca Modelo Versao — sem ano, sem preco",
  "itensVisiveis": ["itens confirmados, ordem abaixo"],
  "fraseFinalCurta": "ignorado pelo app",
  "fotosSugeridas": [indices 0-based das melhores fotos, max 5]
}

━━━ REGRA ABSOLUTA ━━━
So inclua um item se:
  (A) esta EXPLICITAMENTE nos dados do vendedor, OU
  (B) esta CLARAMENTE VISIVEL nas fotos (voce consegue ver o item na imagem)

Se nao tem certeza: NAO INCLUA. Uma lista com 4 itens verdadeiros e melhor que 12 com chutes.
Nao use catalogo, nao use memoria de versao, nao infira pelo ano ou modelo.

━━━ O QUE ANALISAR NAS FOTOS ━━━
Foto externa: cor real, rodas (liga leve ou calota), teto solar, farois (formato LED ou halogenio), retrovisores, antena, tipo de carroceria.
Foto interna — painel: tela de multimidia (visivel ou nao), painel digital ou analogico, comandos no volante, tipo de cambio (alavanca ou botao).
Foto interna — bancos: material (couro, tecido, alcantara), cor, numero de fileiras visiveis, banco do passageiro com ajuste visivel.
Foto traseira: camera de re (lente visivel ou tela com imagem), sensor de estacionamento (pontos na para-choque), engate se visivel.

━━━ LISTA DE ITENS — ORDEM E FORMATO ━━━
Siga esta ordem quando os itens forem confirmados:

1. Motor (ex: "Motor 1.0", "Motor 2.0 Turbo") — so se informado nos dados ou legivel na foto
2. Cambio (ex: "Cambio Manual", "Cambio Automatico") — obrigatorio se confirmado
3. Direcao (ex: "Direcao Eletrica", "Direcao Hidraulica") — so se visivel ou informado
4. Ar-condicionado — so se confirmado
5. Vidros Eletricos — so se confirmado
6. Travas Eletricas — so se confirmado
7. Volante Multifuncional — so se visiveis botoes no volante nas fotos
8. Computador de Bordo — so se visivel no painel nas fotos
9. Multimidia / Central Multimidia — so se tela visivel nas fotos ou confirmado
10. Camera de Re — so se lente ou tela visivel nas fotos ou confirmado
11. Sensor de Estacionamento — so se pontos visiveis na para-choque ou confirmado
12. Bancos em Couro — so se material claramente visivel nas fotos
13. Banco com Ajuste Eletrico — so se controles eletricos visiveis ou confirmado
14. Teto Solar / Teto Panoramico — so se visivel na foto externa ou interna
15. Rodas de Liga Leve — so se visiveis nas fotos (liga leve tem raios metalicos, calota e plastica)
16. Farol de Neblina — so se visiveis na foto frontal
17. Farol Full LED — so se formato caracteristico visivel na foto
18. Ar-condicionado Bizona — so se confirmado
19. 7 Lugares / 3 Fileiras — so se terceira fileira visivel nas fotos ou confirmado
20. Tracao 4x4 / AWD — so se confirmado nos dados
21. Trava de Diferencial — so se confirmado nos dados
22. Airbag Frontal — so se confirmado nos dados ou visivel no volante/painel
23. Freios ABS — so se confirmado nos dados
24. Alarme — so se confirmado
25. Som Bluetooth / Android Auto / Apple CarPlay — so se visivel na tela ou confirmado

Formato de cada item: curto, sem ponto final, primeira letra maiuscula.
Ex: "Cambio Automatico", "Multimidia", "7 Lugares", "Bancos em Couro", "Teto Solar"

Nao inclua: cinto de seguranca, espelho de vaidade, viseira, luz de cortesia, apoio de cabeca, quilometragem, preco.
Nao repita o que ja esta no titulo (marca, modelo, ano).

Dados do veiculo:
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

export async function analyzeVehicleWithClaude(
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
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
  > = [];

  const category = inferVehicleCategory(vehicleData.modelo);

  const dataText =
    VEHICLE_FACTS_PROMPT +
    `
DADOS CONFIRMADOS PELO VENDEDOR:
- Veiculo: ${vehicleData.modelo}
- Ano: ${vehicleData.ano ?? "nao informado"}
- KM: ${vehicleData.km ?? "nao informado"}
- Cor: ${vehicleData.cor ?? "identificar pela foto"}
- Cambio: ${vehicleData.cambio ?? "identificar pela foto"}
- Multimidia: ${vehicleData.multimidia === "sim" ? "SIM — confirmado pelo vendedor" : vehicleData.multimidia === "nao" ? "NAO — confirmado pelo vendedor" : "identificar pela foto"}
- Opcionais declarados: ${vehicleData.opcionais ?? "nenhum declarado"}

CATEGORIA E TOM:
- Categoria: ${category}
- ${categoryGuidance(category)}

INSTRUCAO PARA ANALISE DAS FOTOS:
- Analise todas as fotos enviadas na ordem original do upload.
- Alem dos itens do veiculo, voce precisa ranquear as melhores fotos para publicacao.
- A foto de capa deve ser, quase sempre, a melhor foto EXTERNA do carro, com carroceria inteira, boa luz e enquadramento comercial.
- Priorize para capa e segunda foto: 3/4 dianteiro externo, frontal limpo ou 3/4 traseiro externo.
- Foto interna pode entrar no ranking, mas nunca deve ser capa se existir pelo menos uma externa nitida e completa.
- Evite como capa ou segunda foto: interior, close de painel, banco, foto tremida, escura, cortada ou estourada.
- Em cada foto, confirme apenas o que estiver claramente visivel. Se nao der para ter certeza, nao inclua.
`;

  content.push({ type: "text", text: dataText });

  for (const img of imageBase64.slice(0, MAX_VEHICLE_IMAGES)) {
    const compressed = await compressImage(img);
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: compressed,
      },
    });
  }

  const json = await postAnthropicRequest({
    model: MODEL,
    max_tokens: 1200,
    temperature: 0.2,
    messages: [{ role: "user", content }],
  });
  recordUsage("veiculo", json.usage?.input_tokens ?? 0, json.usage?.output_tokens ?? 0);
  const text = json.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  return parseAIResponse(text);
}

export async function generateVehicleDescriptions(
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
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
  > = [];

  const category = inferVehicleCategory(vehicleData.modelo);

  const dataText =
    PROMPT +
    `
DADOS CONFIRMADOS PELO VENDEDOR:
- Veiculo: ${vehicleData.marca ? vehicleData.marca + " " : ""}${vehicleData.modelo}
- Ano: ${vehicleData.ano ?? "nao informado"}
- KM: ${vehicleData.km ?? "nao informado"}
- Cor: ${vehicleData.cor ?? "identificar pela foto"}
- Cambio: ${vehicleData.cambio ?? "identificar pela foto"}
- Valor de venda: ${vehicleData.valorVenda ?? "nao informado"}
- Multimidia: ${vehicleData.multimidia === "sim" ? "SIM — confirmado pelo vendedor" : vehicleData.multimidia === "nao" ? "NAO — confirmado pelo vendedor" : "identificar pela foto"}
- Opcionais declarados: ${vehicleData.opcionais ?? "nenhum declarado"}

CATEGORIA E TOM:
- Categoria: ${category}
- ${categoryGuidance(category)}

CONTEXTO DA LOJA:
${vehicleData.contextoLoja ?? "Loja padrao. Tom comercial profissional."}
`;

  content.push({ type: "text", text: dataText });

  for (const img of imageBase64.slice(0, MAX_VEHICLE_IMAGES)) {
    const compressed = await compressImage(img);
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: compressed,
      },
    });
  }

  const json = await postAnthropicRequest({
    model: MODEL,
    max_tokens: 1600,
    temperature: 0.35,
    messages: [{ role: "user", content }],
  });
  recordUsage("descricoes", json.usage?.input_tokens ?? 0, json.usage?.output_tokens ?? 0);
  const text = json.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  return parseDescriptionsResponse(text);
}

function parseDescriptionsResponse(text: string): AIDescriptionsResult {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const rawJson = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const json = JSON.parse(rawJson);

  const sanitize = (v: string) => postFilterGeneratedText(sanitizeGeneratedText(v ?? ""));
  const formatListing = (v: string) => formatListingText(sanitize(v));

  return {
    titulo: sanitizeTitle(json.titulo ?? ""),
    descricaoOlx: formatListing(json.descricaoOlx ?? ""),
    descricaoMarketplace: formatListing(json.descricaoMarketplace ?? ""),
    descricaoWhatsapp: formatWhatsappText(sanitize(json.descricaoWhatsapp ?? "")),
  };
}

export interface AIReparoEstimado {
  categoria: CustoReparoCategoria;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface AIEstimativaCustos {
  tamanho: "pequeno" | "grande";
  reparos: AIReparoEstimado[];
  totalReparos: number;
  custoTotal: number;
  precoVendaSugerido: number;
  lucroEstimado: number;
  margemPercent: number;
  justificativa: string;
}

export async function estimarCustosVeiculo(params: {
  modelo: string;
  ano: string;
  custoCompra: number;
  valorFipe: number;
  config: ConfiguracaoPrecos;
}): Promise<AIEstimativaCustos> {
  const { modelo, ano, custoCompra, valorFipe, config } = params;
  const descontoPercent = valorFipe > 0 ? ((valorFipe - custoCompra) / valorFipe) * 100 : 0;

  const prompt = `Voce e um especialista em preparacao de veiculos seminovos para revenda em concessionarias brasileiras.

Dados do veiculo:
- Modelo: ${modelo} ${ano}
- Preco pago (custo de compra): R$ ${custoCompra.toLocaleString("pt-BR")}
- Preco FIPE: R$ ${valorFipe.toLocaleString("pt-BR")}
- Desconto em relacao a FIPE: ${descontoPercent.toFixed(1)}%

Tabela de precos desta loja:
- Pintura por peca: R$ ${config.pinturaPorPeca}
- Pneu (carro pequeno): R$ ${config.pneuPequeno} | Pneu (carro grande): R$ ${config.pneuGrande}
- Higienizacao (carro pequeno): R$ ${config.higienizacaoPequeno} | Higienizacao (carro grande): R$ ${config.higienizacaoGrande}
- Margem de lucro desejada: ${config.margemLucroPercent}%

Com base no modelo e no desconto em relacao a FIPE, estime os reparos tipicos necessarios para deixar o carro pronto para venda.

Regras:
- Desconto ate 10%: reparos minimos
- Desconto 10-20%: reparos moderados
- Desconto 20-30%: reparos significativos
- Desconto acima de 30%: reparos pesados
- Classifique como "pequeno" ou "grande"
- Use os precos exatos da tabela fornecida
- O preco de venda sugerido deve garantir a margem de lucro desejada

Retorne APENAS um JSON valido, sem markdown:
{
  "tamanho": "pequeno" ou "grande",
  "reparos": [
    {
      "categoria": "pintura" | "pneus" | "higienizacao" | "mecanica" | "polimento" | "retrovisor" | "outro",
      "descricao": "descricao curta do reparo",
      "quantidade": numero inteiro,
      "valorUnitario": valor em reais,
      "valorTotal": quantidade * valorUnitario
    }
  ],
  "totalReparos": soma de todos valorTotal,
  "custoTotal": custoCompra + totalReparos,
  "precoVendaSugerido": preco que garante a margem desejada,
  "lucroEstimado": precoVendaSugerido - custoTotal,
  "margemPercent": percentual de margem real,
  "justificativa": "Explicacao breve em portugues"
}`;

  const json = await postAnthropicRequest({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });
  recordUsage("custos", json.usage?.input_tokens ?? 0, json.usage?.output_tokens ?? 0);
  const text = json.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    tamanho: parsed.tamanho ?? "pequeno",
    reparos: Array.isArray(parsed.reparos) ? parsed.reparos : [],
    totalReparos: parsed.totalReparos ?? 0,
    custoTotal: parsed.custoTotal ?? custoCompra,
    precoVendaSugerido: parsed.precoVendaSugerido ?? 0,
    lucroEstimado: parsed.lucroEstimado ?? 0,
    margemPercent: parsed.margemPercent ?? 0,
    justificativa: parsed.justificativa ?? "",
  };
}

async function postAnthropicRequest(body: Record<string, unknown>) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.text();
        if (RETRYABLE_STATUS.has(res.status) && attempt < 2) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1000 * Math.pow(2, attempt);
          await wait(waitMs);
          continue;
        }

        if (res.status === 413) {
          throw new Error("As fotos enviadas ficaram pesadas demais para a IA. Tente usar menos imagens ou fotos mais leves.");
        }

        throw new Error(`Anthropic API: ${res.status} - ${err}`);
      }

      return res.json();
    } catch (error) {
      window.clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === "AbortError") {
        lastError = new Error("A IA demorou demais para responder. Tente novamente em alguns segundos.");
      } else {
        lastError = error instanceof Error ? error : new Error("Falha desconhecida ao consultar a IA.");
      }

      if (attempt < 2) {
        await wait(1000 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Nao foi possivel concluir a geracao com IA.");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Remove itens que duplicam a quilometragem já exibida no cabeçalho do anúncio
function isKmDuplicateItem(item: string): boolean {
  const n = item.trim().toLowerCase();
  return (
    /\d[\d.,]*(\.?\d{3})?\s*km/.test(n) ||
    /\d+\s*mil\s*km/.test(n) ||
    /^km[:\s]/.test(n) ||
    /quilometragem/.test(n) ||
    /km\s*rodados/.test(n)
  );
}

// Remove apenas itens que nunca têm valor informativo para o comprador
const TRIVIAL_ITEMS = [
  "cinto de seguranca",
  "cintos de seguranca",
  "cintos retrateis",
  "espelho de vaidade",
  "viseira",
  "luz de cortesia",
  "porta objetos",
  "porta-objetos",
  "travamento automatico de portas",
  "luz interna",
  "apoio de cabeca",
  "apoios de cabeca",
];

function isStandardItem(item: string): boolean {
  const n = item.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return TRIVIAL_ITEMS.some((s) => {
    const sn = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return n === sn || n.startsWith(sn + " ") || n.endsWith(" " + sn) || n.includes(" " + sn + " ");
  });
}

function parseAIResponse(text: string): AIVehicleResult {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const rawJson = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const json = JSON.parse(rawJson);

  if (!json.tituloBase && !json.modeloIdentificado && !Array.isArray(json.itensVisiveis)) {
    throw new Error("A IA respondeu sem fatos uteis para montar o anuncio.");
  }

  return {
    modeloIdentificado: sanitizeTitle(json.modeloIdentificado ?? ""),
    tituloBase: sanitizeTitle(json.tituloBase ?? ""),
    itensVisiveis: Array.isArray(json.itensVisiveis)
      ? json.itensVisiveis
          .filter((item: unknown) => typeof item === "string")
          .map((item: string) => postFilterGeneratedText(sanitizeGeneratedText(item)))
          .filter(Boolean)
          .filter((item: string) => !isKmDuplicateItem(item))
          .filter((item: string) => !isStandardItem(item))
          .slice(0, 14)
      : [],
    fraseFinalCurta: postFilterGeneratedText(sanitizeGeneratedText(json.fraseFinalCurta ?? "")),
    fotosSugeridas: Array.isArray(json.fotosSugeridas)
      ? json.fotosSugeridas.slice(0, 5).filter((n: unknown) => typeof n === "number")
      : [0, 1, 2, 3, 4],
  };
}

function sanitizeTitle(value: string) {
  return sanitizeGeneratedText(value)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .trim();
}

function postFilterGeneratedText(value: string) {
  return value
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      if (!normalized) return true;
      return !BANNED_PHRASES.some((phrase) => normalized.includes(phrase));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatListingText(value: string) {
  return value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function formatWhatsappText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
}

function sanitizeGeneratedText(value: string) {
  if (!value) return "";

  let cleaned = value
    .replace(/\r/g, "")
    .replaceAll("🚗", "")
    .replaceAll("🚙", "")
    .replaceAll("📲", "")
    .replaceAll("📍", "")
    .replaceAll("📅", "")
    .replaceAll("💰", "")
    .replaceAll("✅", "")
    .replaceAll("✔️", "")
    .replaceAll("🔹", "")
    .replaceAll("•", "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  cleaned = cleaned
    .replace(/\(\s*\)/g, "")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n ,/g, "\n")
    .replace(/\n\./g, "\n")
    .replace(/^\s*[-–—]\s*/gm, "")
    .trim();

  return cleaned;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
