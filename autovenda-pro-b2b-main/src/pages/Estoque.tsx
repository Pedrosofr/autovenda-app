import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDeferredValue } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Archive,
  Car,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useAppStore } from "@/store/appStore";
import type { AjustesFoto, Veiculo } from "@/store/types";
import { analyzeVehicleWithGemini as analyzeVehicleWithClaude, generateVehicleDescriptionsWithGemini as generateVehicleDescriptions, type AIVehicleResult } from "@/services/gemini";

type EstoqueViewMode = "ativos" | "arquivados" | "lixeira";
type CompareMode = "comparar" | "original" | "tratada";
type ShareChannel = "whatsapp" | "marketplace" | "olx";

interface VehicleDraft {
  modelo: string;
  ano: string;
  km: string;
  cor: string;
  cambio: string;
  multimidia: "" | "sim" | "nao";
  leilao: boolean;
  sinistro: boolean;
  valorVenda: string;
  fotos: string[];
  fotoCapaIndex: number;
  fotosDestaque: number[];
  ajustesFoto: AjustesFoto;
  tituloAnuncio: string;
  descricaoOlx: string;
  descricaoMarketplace: string;
  descricaoWhatsapp: string;
}

const statusConfig = {
  disponivel: { label: "Disponivel", dot: "bg-emerald-400", bg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  reservado: { label: "Reservado", dot: "bg-amber-400", bg: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
  vendido: { label: "Vendido", dot: "bg-sky-400", bg: "bg-sky-500/10 text-sky-300 border-sky-500/20" },
};

const defaultAjustes: AjustesFoto = { brilho: 106, contraste: 105, saturacao: 104, calor: 2 };

function createEmptyDraft(): VehicleDraft {
  return {
    modelo: "",
    ano: "",
    km: "",
    cor: "",
    cambio: "",
    multimidia: "",
    leilao: false,
    sinistro: false,
    valorVenda: "",
    fotos: [],
    fotoCapaIndex: 0,
    fotosDestaque: [],
    ajustesFoto: { ...defaultAjustes },
    tituloAnuncio: "",
    descricaoOlx: "",
    descricaoMarketplace: "",
    descricaoWhatsapp: "",
  };
}

function filtersFromAjustes(ajustes: AjustesFoto) {
  return `brightness(${ajustes.brilho}%) contrast(${ajustes.contraste}%) saturate(${ajustes.saturacao}%) sepia(${Math.max(0, ajustes.calor)}%)`;
}

function normalizeCoverIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function buildPhotoPriorityOrder(length: number, suggested: number[] = []) {
  const validSuggestions = suggested.filter((index, position, array) =>
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    array.indexOf(index) === position,
  );

  const remaining = Array.from({ length }, (_, index) => index).filter((index) => !validSuggestions.includes(index));
  return [...validSuggestions, ...remaining];
}

function diasEmEstoque(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

type VehicleProfile = "hatch" | "sedan" | "suv" | "pickup" | "utilitario" | "premium" | "geral";

function detectVehicleProfile(modelo: string): VehicleProfile {
  const normalized = modelo.toLowerCase();

  if (/(hilux|ranger|s10|amarok|frontier|saveiro|strada|montana|toro)/.test(normalized)) return "pickup";
  if (/(sprinter|ducato|boxer|master|daily|fiorino|kangoo|partner|doblo|van)/.test(normalized)) return "utilitario";
  if (/(compass|renegade|creta|tracker|tiggo|tiggo8|tiggo7|nivus|taos|corolla cross|t-cross|kicks|sportage|ix35|captur|hr-v|cr-v|equinox|sw4|outlander|ecosport|captiva|blazer|duster|kardian|pulse|fastback|eclipse cross|asx|territory|bronco|jeep commander|grand cherokee|defender|discovery|tucson|santa fe|sorento|carnival|pajero|pajero sport|trailblazer|traverse|trax|encore|mokka|crossfox)/.test(normalized)) return "suv";
  if (/(bmw|mercedes|audi|volvo|land rover|jaguar|lexus|porsche|mini|passat|jetta gli|fusion|commander)/.test(normalized)) return "premium";
  if (/(civic|corolla|city|versa|sentra|cruze|virtus|onix plus|prisma|hb20s|logan|yaris sedan)/.test(normalized)) return "sedan";
  if (/(onix|hb20|gol|polo|argo|mobi|kwid|208|c3|fit|march|fox|up|sandero|yaris hatch)/.test(normalized)) return "hatch";
  return "geral";
}

function buildFallbackCopy(
  modelo: string,
  ano: string,
  valor: string,
  extras?: {
    km?: string;
    cor?: string;
    cambio?: string;
    multimidia?: "" | "sim" | "nao";
  },
  telefoneLoja?: string
) {
  const profile = detectVehicleProfile(modelo);
  const headline = `${modelo} ${ano}`.trim();
  const infoLines = [
    ano ? `📅 Ano: ${ano}` : "",
    extras?.km ? `📍 Quilometragem: ${extras.km}` : "",
    valor ? `💰 Valor: ${valor}` : "",
  ].filter(Boolean);

  const featureLines = [
    extras?.cor ? `🔹 Cor: ${formatCase(extras.cor)}` : "",
    extras?.cambio ? `🔹 Cambio: ${formatCase(extras.cambio)}` : "",
    extras?.multimidia === "sim" ? "🔹 Multimidia" : "",
    extras?.multimidia === "nao" ? "🔹 Sem multimidia" : "",
  ].filter(Boolean);

  const profileParagraph = `🚘 ${{
    hatch: extras?.cambio?.toLowerCase().includes("auto")
      ? "Hatch automatico, pratico na cidade e economico na estrada."
      : "Hatch compacto, economico e agil para o dia a dia.",
    sedan: "Sedan com acabamento, conforto e espaco acima da media.",
    suv: extras?.multimidia === "sim"
      ? "SUV com tecnologia, altura e versatilidade para cidade e estrada."
      : "SUV com porte, conforto e espaco para o dia a dia.",
    pickup: "Picape robusta, pronta para carga, trabalho e uso diario.",
    utilitario: "Utilitario pronto para operacao comercial e entrega.",
    premium: "Modelo premium com acabamento, tecnologia e desempenho diferenciado.",
    geral: "Veiculo com custo-beneficio atrativo e boas condicoes de uso.",
  }[profile]}`;

  const phoneContact = telefoneLoja?.trim() ? `📲 Chama no ${telefoneLoja.trim()}` : "📲 Chama no zap!";
  const closingLine = `💳 Financiamento em ate 60x | Aceitamos na troca\n${phoneContact}`;

  return {
    titulo: [modelo, ano, valor].filter(Boolean).join(" | "),
    olx: [`🚗 ${headline}`, ...infoLines, "", ...featureLines, "", profileParagraph, closingLine].filter(Boolean).join("\n"),
    marketplace: [`🚗 ${headline}`, ...infoLines, "", ...featureLines, "", profileParagraph, closingLine].filter(Boolean).join("\n"),
    whatsapp: [`🚗 ${headline}`, ...infoLines, ...featureLines.slice(0, 4), closingLine].filter(Boolean).join("\n"),
  };
}

function dedupeLines(lines: string[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const normalized = line.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function cleanTitleBase(value: string, ano: string) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const yearPattern = new RegExp(`\\b${ano}\\b`, "g");
  return collapsed.replace(yearPattern, "").replace(/\s+/g, " ").trim();
}

function buildTitle(value: string, ano: string) {
  const base = cleanTitleBase(value, ano);
  return base.replace(/\s+/g, " ").trim();
}

function formatCase(value: string) {
  if (!value) return "";
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildContextClosingLine(modelo: string, items: string[]) {
  const profile = detectVehicleProfile(modelo);
  const normalizedItems = items.map((item) => normalizeItem(item));
  const hasSevenSeats = normalizedItems.some((i) => i.includes("7 lugares") || i.includes("sete lugares"));
  const hasAutomatic = normalizedItems.some((i) => i.includes("automatico") || i.includes("automatica"));
  const hasMultimedia = normalizedItems.some((i) => i.includes("multimidia"));
  const has4x4 = normalizedItems.some((i) => i.includes("4x4") || i.includes("tracao") || i.includes("diferencial"));
  const hasLeather = normalizedItems.some((i) => i.includes("couro"));
  const hasSunroof = normalizedItems.some((i) => i.includes("teto solar") || i.includes("panoramico"));

  switch (profile) {
    case "hatch":
      return hasAutomatic
        ? "Hatch automatico e economico — o certo para o dia a dia na cidade."
        : "Compacto, agil e economico — ideal para quem vive na cidade.";
    case "sedan":
      return hasLeather
        ? "Sedan com couro e espaco — conforto e elegancia pelo preco certo."
        : "Sedan espaçoso e bem acabado — mais carro pelo mesmo investimento.";
    case "suv":
      if (hasSevenSeats && hasSunroof) return "SUV 7 lugares com teto solar — espaco, familia e estilo em um so carro.";
      if (hasSevenSeats) return "SUV 7 lugares alto e completo — o certo para familia e viagem.";
      if (hasSunroof && hasMultimedia) return "SUV com teto solar e multimidia — tecnologia e versatilidade sem abrir mao de nada.";
      return hasMultimedia
        ? "SUV com tecnologia e altura de conducao — versatil na cidade e na estrada."
        : "SUV robusto e confortavel — porte e praticidade para o dia a dia.";
    case "pickup":
      return has4x4
        ? "Picape 4x4 para qualquer terreno — trabalho pesado e conforto no mesmo pacote."
        : "Picape robusta e confiavel — pronta para carga, trabalho e uso diario.";
    case "utilitario":
      return "Utilitario pronto para trabalhar — carga, entrega e custo baixo.";
    case "premium":
      return hasSunroof && hasLeather
        ? "Premium com couro e teto solar — luxo e desempenho em cada detalhe."
        : "Premium com acabamento refinado — diferente desde a primeira dirigida.";
    default:
      return hasMultimedia
        ? "Completo e bem equipado — otima relacao custo-beneficio."
        : "Pronto para rodar — custo-beneficio atrativo.";
  }
}

function normalizeItem(item: string) {
  let normalized = item.trim().toLowerCase();
  normalized = normalized
    .replace(/^cor[:\s-]*/i, "")
    .replace(/^cambio[:\s-]*/i, "")
    .replace(/^câmbio[:\s-]*/i, "")
    .replace(/^central multimidia\b/g, "multimidia")
    .replace(/^central multimídia\b/g, "multimidia")
    .replace(/^multimidia com tela\b/g, "multimidia")
    .replace(/^multimídia com tela\b/g, "multimidia")
    .replace(/\bautomatica\b/g, "automatico")
    .replace(/\bautomático\b/g, "automatico")
    .replace(/\bmanual\b/g, "manual")
    .replace(/\bauto\b/g, "automatico")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function buildVehicleTexts(
  vehicle: {
    modelo: string;
    ano: string;
    km?: string;
    cor?: string;
    cambio?: string;
    multimidia?: "" | "sim" | "nao";
    valorVenda: string;
  },
  facts?: Partial<AIVehicleResult>,
  telefoneLoja?: string
) {
  const sourceTitle = facts?.tituloBase || facts?.modeloIdentificado || vehicle.modelo;
  const title = buildTitle(sourceTitle || vehicle.modelo, vehicle.ano);

  const confirmedItems = [
    vehicle.cor ? `Cor: ${formatCase(vehicle.cor)}` : "",
    vehicle.cambio ? `Cambio: ${formatCase(vehicle.cambio)}` : "",
    vehicle.multimidia === "sim" ? "Multimidia" : "",
    vehicle.multimidia === "nao" ? "Sem multimidia" : "",
  ];

  const visualItems = Array.isArray(facts?.itensVisiveis) ? facts.itensVisiveis : [];
  const rawItems = [...confirmedItems, ...visualItems]
    .map((item) => item.trim())
    .filter(Boolean);

  const seenNormalized = new Set<string>();
  const items = rawItems.filter((item) => {
    const normalized = normalizeItem(item);
    if (!normalized || seenNormalized.has(normalized)) return false;
    seenNormalized.add(normalized);
    return true;
  }).slice(0, 14);

  // OLX — anúncio tradicional com emojis e texto corrido
  const infoLines = [
    vehicle.ano ? `📅 Ano: ${vehicle.ano}` : "",
    vehicle.km ? `📍 Quilometragem: ${vehicle.km}` : "",
    vehicle.valorVenda ? `💰 Valor: ${vehicle.valorVenda}` : "",
  ].filter(Boolean);

  const itemLines = items.map((item) => `🔹 ${formatCase(item)}`);
  const phoneContact = telefoneLoja?.trim()
    ? `📲 Chama no ${telefoneLoja.trim()}`
    : "📲 Chama no zap!";
  const contextLine = buildContextClosingLine(vehicle.modelo, items);
  const contextLineWithEmoji = contextLine ? `🚘 ${contextLine}` : "";

  const olx = [
    `🚗 ${title}`,
    ...infoLines,
    "",
    ...itemLines,
    "",
    contextLineWithEmoji,
    `💳 Financiamento em ate 60x | Aceitamos na troca\n${phoneContact}`,
  ]
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .filter((line, index, arr) => !(index === arr.length - 1 && line === ""))
    .join("\n");

  // Marketplace — seco, objetivo, sem emojis, estilo ficha de loja
  const infoPlain = [
    vehicle.ano ? `Ano: ${vehicle.ano}` : "",
    vehicle.km ? `KM: ${vehicle.km}` : "",
    vehicle.valorVenda ? `Valor: ${vehicle.valorVenda}` : "",
  ].filter(Boolean);
  const itemsPlain = items.slice(0, 8).map((item) => formatCase(item));
  const telPlain = telefoneLoja?.trim() ? `Fale conosco: ${telefoneLoja.trim()}` : "Entre em contato para mais informacoes.";

  const marketplace = [
    title,
    ...infoPlain,
    "",
    ...itemsPlain,
    "",
    "Financiamento facilitado. Aceitamos usados na troca.",
    telPlain,
  ]
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .filter((line, index, arr) => !(index === arr.length - 1 && line === ""))
    .join("\n");

  // WhatsApp — ultra-curto, direto, sem emojis, humano
  const topItems = items.slice(0, 4).map((item) => formatCase(item)).join(" | ");
  const whatsappLines = [
    `${title}${vehicle.ano ? " " + vehicle.ano : ""}`,
    vehicle.km ? `${vehicle.km} km` : "",
    vehicle.valorVenda ? `R$ ${vehicle.valorVenda}` : "",
    topItems || "",
    telefoneLoja?.trim()
      ? `Financiamento e troca. Chama: ${telefoneLoja.trim()}`
      : "Financiamento e troca. Chama no zap!",
  ].filter(Boolean);

  const whatsapp = whatsappLines.join("\n");

  return {
    titulo: title,
    olx,
    marketplace,
    whatsapp,
  };
}

function fallbackTitle(modelo: string, ano: string, valorVenda: string, extras?: Parameters<typeof buildFallbackCopy>[3], tel?: string) {
  return buildFallbackCopy(modelo, ano, valorVenda, extras, tel).titulo;
}

function fallbackOlx(modelo: string, ano: string, valor: string, extras?: Parameters<typeof buildFallbackCopy>[3], tel?: string) {
  return buildFallbackCopy(modelo, ano, valor, extras, tel).olx;
}

function fallbackMarketplace(modelo: string, ano: string, valor: string, extras?: Parameters<typeof buildFallbackCopy>[3], tel?: string) {
  return buildFallbackCopy(modelo, ano, valor, extras, tel).marketplace;
}

function fallbackWhatsApp(modelo: string, ano: string, valor: string, extras?: Parameters<typeof buildFallbackCopy>[3], tel?: string) {
  return buildFallbackCopy(modelo, ano, valor, extras, tel).whatsapp;
}

async function createImageFromSource(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel preparar a imagem para compartilhamento."));
    image.src = src;
  });
}

async function buildProcessedPhotoFile(src: string, ajustes: AjustesFoto, filename: string) {
  const image = await createImageFromSource(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Nao foi possivel preparar o pack de imagens.");
  }

  context.filter = filtersFromAjustes(ajustes);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) {
    throw new Error("Nao foi possivel gerar a versao tratada da foto.");
  }

  return new File([blob], filename, { type: "image/jpeg" });
}

async function writeTextSafe(text: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function tryWriteTextSafe(text: string) {
  try {
    return await writeTextSafe(text);
  } catch {
    return false;
  }
}

function orderedVehiclePhotos(veiculo: Veiculo) {
  const coverIndex = normalizeCoverIndex(veiculo.fotoCapaIndex ?? 0, veiculo.fotos.length);
  const ordered = veiculo.fotos
    .map((foto, index) => ({ foto, index }))
    .sort((a, b) => (a.index === coverIndex ? -1 : b.index === coverIndex ? 1 : a.index - b.index));

  return ordered;
}

function getPublicationPhotoIndices(veiculo: Veiculo) {
  const coverIndex = normalizeCoverIndex(veiculo.fotoCapaIndex ?? 0, veiculo.fotos.length);
  const destaqueIndex =
    veiculo.fotosDestaque?.find((index) => index !== coverIndex && index >= 0 && index < veiculo.fotos.length) ??
    veiculo.fotos.findIndex((_, index) => index !== coverIndex);

  return {
    capa: coverIndex,
    destaque: destaqueIndex >= 0 ? destaqueIndex : coverIndex,
  };
}

function MarcarVendido({
  veiculo,
  vendedores,
  onVendido,
}: {
  veiculo: Veiculo;
  vendedores: { id: string; nome: string }[];
  onVendido: () => void;
}) {
  const { addVenda } = useAppStore();
  const { user } = useAuth();
  const sellerMembershipId = user?.role === "seller" ? user.membershipId : null;
  const [open, setOpen] = useState(false);
  const [vendedorId, setVendedorId] = useState(sellerMembershipId ?? "");
  const valor = parseFloat(veiculo.valorVenda.replace(/[^\d,]/g, "").replace(",", ".")) || 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="border-white/10 text-white/70 hover:text-white hover:bg-white/5">
        Marcar vendido
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-sm bg-[hsl(230,18%,11%)] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Marcar como vendido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-white/40">{veiculo.modelo} {veiculo.ano}</p>
            {sellerMembershipId ? (
              <div className="space-y-2">
                <Label className="text-white/60">Vendedor</Label>
                <Input
                  value={vendedores.find((v) => v.id === sellerMembershipId)?.nome ?? "Seu usuario"}
                  readOnly
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-white/60">Vendedor</Label>
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-[hsl(230,18%,13%)] border-white/10">
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="text-white">{v.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={() => { if (!vendedorId) return; addVenda(veiculo.id, vendedorId, valor); setOpen(false); onVendido(); }} disabled={!vendedorId} className="w-full">
              Confirmar venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Estoque() {
  const {
    veiculos,
    vendedores,
    memoriaLoja,
    configPrecos,
    addVeiculo,
    updateVeiculo,
    archiveVeiculo,
    trashVeiculo,
    restoreVeiculo,
    removeVeiculo,
    clearDeletedVeiculos,
    registrarAprendizadoLoja,
  } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<EstoqueViewMode>("ativos");
  const [showNew, setShowNew] = useState(false);
  const [showDetail, setShowDetail] = useState<Veiculo | null>(null);
  const [detailPhotoIdx, setDetailPhotoIdx] = useState(0);
  const [draftPhotoIdx, setDraftPhotoIdx] = useState(0);
  const [draft, setDraft] = useState<VehicleDraft>(() => createEmptyDraft());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("comparar");
  const [shareChannel, setShareChannel] = useState<ShareChannel>("whatsapp");

  const counts = useMemo(
    () => ({
      ativos: veiculos.filter((v) => !v.archivedAt && !v.deletedAt).length,
      arquivados: veiculos.filter((v) => v.archivedAt && !v.deletedAt).length,
      lixeira: veiculos.filter((v) => v.deletedAt).length,
    }),
    [veiculos]
  );

  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const visibleVeiculos = useMemo(() => {
    const base =
      viewMode === "arquivados"
        ? veiculos.filter((v) => v.archivedAt && !v.deletedAt)
        : viewMode === "lixeira"
          ? veiculos.filter((v) => v.deletedAt)
          : veiculos.filter((v) => !v.archivedAt && !v.deletedAt);

    return base.filter((v) => {
      const matchSearch = !normalizedSearch || v.modelo.toLowerCase().includes(normalizedSearch);
      const matchStatus = filterStatus === "todos" || v.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [veiculos, viewMode, normalizedSearch, filterStatus]);

  const totalDisponivel = visibleVeiculos.filter((v) => v.status === "disponivel").length;
  const totalReservado = visibleVeiculos.filter((v) => v.status === "reservado").length;
  const totalVendido = visibleVeiculos.filter((v) => v.status === "vendido").length;
  const resumoEstoque = `${visibleVeiculos.length} ve\u00edculos \u2022 ${totalDisponivel} dispon\u00edveis \u2022 ${totalReservado} reservados \u2022 ${totalVendido} vendidos`;

  const resetDraft = useCallback(() => {
    setDraft(createEmptyDraft());
    setCompareMode("comparar");
    setDraftPhotoIdx(0);
  }, []);

  const handlePhotoUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const base64Photos = await Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || "");
            reader.readAsDataURL(file);
          })
      )
    );
    setDraft((prev) => {
      const fotos = [...prev.fotos, ...base64Photos];
      const ordered = buildPhotoPriorityOrder(fotos.length, prev.fotosDestaque);
      return {
        ...prev,
        fotos,
        fotoCapaIndex: normalizeCoverIndex(prev.fotoCapaIndex, fotos.length),
        fotosDestaque: ordered.filter((index) => index !== prev.fotoCapaIndex).slice(0, 4),
      };
    });
  }, []);

  const updateDraft = <K extends keyof VehicleDraft>(field: K, value: VehicleDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const patchDraft = useCallback((patch: Partial<VehicleDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const draftFacts = {
    km: draft.km,
    cor: draft.cor,
    cambio: draft.cambio,
    multimidia: draft.multimidia,
  } as const;

  const generateWithAI = async () => {
    if (!draft.modelo.trim() || draft.fotos.length === 0) {
      toast.error("Adicione fotos e o nome do veiculo antes de gerar");
      return;
    }

    setIsGenerating(true);
    try {
      const contextoLoja = [
        `Tom da loja: ${memoriaLoja.tomDeVoz}`,
        `Focos comerciais: ${memoriaLoja.focosComerciais.join(", ") || "nao definidos"}`,
        `Frases recorrentes: ${memoriaLoja.frasesRecorrentes.join(" | ") || "nenhuma ainda"}`,
        `Categorias mais usadas: ${memoriaLoja.categoriasMaisUsadas.join(", ") || "mistas"}`,
        memoriaLoja.exemplosRecentes.length
          ? `Exemplos recentes aprovados: ${memoriaLoja.exemplosRecentes
              .slice(0, 2)
              .map((item) => `${item.modelo}: ${item.titulo}`)
              .join(" || ")}`
          : "Exemplos recentes aprovados: nenhum ainda",
      ].join("\n");

      const vehiclePayload = {
        modelo: draft.modelo,
        ano: draft.ano || undefined,
        km: draft.km || undefined,
        cor: draft.cor || undefined,
        cambio: draft.cambio || undefined,
        multimidia: draft.multimidia || undefined,
        opcionais: [
          draft.cambio ? `Cambio: ${draft.cambio}` : "",
          draft.multimidia === "sim" ? "Multimidia: sim" : "",
          draft.multimidia === "nao" ? "Multimidia: nao" : "",
        ]
          .filter(Boolean)
          .join(" | ") || undefined,
        contextoLoja,
      };

      const [result, descriptions] = await Promise.all([
        analyzeVehicleWithClaude(draft.fotos, vehiclePayload),
        generateVehicleDescriptions(draft.fotos, {
          ...vehiclePayload,
          valorVenda: draft.valorVenda || undefined,
          telefone: configPrecos.telefoneLoja || undefined,
        }).catch(() => null),
      ]);

      const orderedPhotoIndices = buildPhotoPriorityOrder(draft.fotos.length, result.fotosSugeridas ?? []);
      const coverIndex = normalizeCoverIndex(orderedPhotoIndices[0] ?? 0, draft.fotos.length);

      // Usa descrições diretas da IA quando disponíveis (formato marketplace real)
      // Fallback para buildVehicleTexts caso a segunda etapa falhe
      const fallbackTemplates = buildVehicleTexts(
        {
          modelo: draft.modelo,
          ano: draft.ano,
          km: draft.km,
          cor: draft.cor,
          cambio: draft.cambio,
          multimidia: draft.multimidia,
          valorVenda: draft.valorVenda,
        },
        result,
        configPrecos.telefoneLoja
      );

      patchDraft({
        tituloAnuncio: descriptions?.titulo || fallbackTemplates.titulo,
        descricaoOlx: descriptions?.descricaoOlx || fallbackTemplates.olx,
        descricaoMarketplace: descriptions?.descricaoMarketplace || fallbackTemplates.marketplace,
        descricaoWhatsapp: descriptions?.descricaoWhatsapp || fallbackTemplates.whatsapp,
        fotoCapaIndex: coverIndex,
        fotosDestaque: orderedPhotoIndices.filter((index) => index !== coverIndex).slice(0, 4),
      });
      setDraftPhotoIdx(coverIndex);
      toast.success("Descricao completa gerada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar conteudo");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveDraft = () => {
    if (!draft.modelo.trim() || draft.fotos.length === 0) {
      toast.error("Cadastre ao menos modelo e fotos");
      return;
    }

    const fallbackTemplates = buildVehicleTexts(
      {
        modelo: draft.modelo,
        ano: draft.ano,
        km: draft.km,
        cor: draft.cor,
        cambio: draft.cambio,
        multimidia: draft.multimidia,
        valorVenda: draft.valorVenda,
      },
      undefined,
      configPrecos.telefoneLoja
    );
    const tel = configPrecos.telefoneLoja;
    const tituloFinal = draft.tituloAnuncio || fallbackTemplates.titulo || fallbackTitle(draft.modelo, draft.ano, draft.valorVenda, draftFacts, tel);
    const descricaoOlxFinal = draft.descricaoOlx || fallbackTemplates.olx || fallbackOlx(draft.modelo, draft.ano, draft.valorVenda, draftFacts, tel);
    const descricaoMarketplaceFinal = draft.descricaoMarketplace || fallbackTemplates.marketplace || fallbackMarketplace(draft.modelo, draft.ano, draft.valorVenda, draftFacts, tel);
    const descricaoWhatsappFinal = draft.descricaoWhatsapp || fallbackTemplates.whatsapp || fallbackWhatsApp(draft.modelo, draft.ano, draft.valorVenda, draftFacts, tel);

    addVeiculo({
      fotos: draft.fotos,
      fotosDestaque: buildPhotoPriorityOrder(draft.fotos.length, draft.fotosDestaque)
        .filter((index) => index !== draft.fotoCapaIndex)
        .slice(0, 4),
      modelo: draft.modelo.trim(),
      ano: draft.ano,
      km: draft.km || undefined,
      cor: draft.cor || undefined,
      cambio: draft.cambio || undefined,
      multimidia: draft.multimidia || undefined,
      leilao: draft.leilao,
      sinistro: draft.sinistro,
      valorVenda: draft.valorVenda,
      custo: "",
      status: "disponivel",
      tituloAnuncio: tituloFinal,
      descricaoOlx: descricaoOlxFinal,
      descricaoMarketplace: descricaoMarketplaceFinal,
      descricaoWhatsapp: descricaoWhatsappFinal,
      hashtags: [],
      fotoCapaIndex: draft.fotoCapaIndex,
      ajustesFoto: draft.ajustesFoto,
    });

    registrarAprendizadoLoja({
      modelo: draft.modelo.trim(),
      titulo: tituloFinal,
      descricao: descricaoOlxFinal,
      categoria: detectVehicleProfile(draft.modelo),
    });

    toast.success("Veiculo cadastrado");
    setShowNew(false);
    resetDraft();
  };

  const shareWhatsApp = (veiculo: Veiculo) => {
    const message = encodeURIComponent(
      veiculo.descricaoWhatsapp || veiculo.descricaoOlx || `${veiculo.modelo} ${veiculo.ano} - ${veiculo.valorVenda}`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  const handleClearTrash = () => {
    if (!counts.lixeira) return;
    if (!window.confirm("Excluir todos os veiculos da lixeira permanentemente?")) return;
    clearDeletedVeiculos();
    if (showDetail?.deletedAt) setShowDetail(null);
  };

  const handlePermanentDelete = (veiculo: Veiculo) => {
    if (!window.confirm(`Excluir permanentemente o veiculo "${veiculo.modelo}"?`)) return;
    removeVeiculo(veiculo.id);
    if (showDetail?.id === veiculo.id) setShowDetail(null);
  };

  const draftCover = draft.fotos[normalizeCoverIndex(draft.fotoCapaIndex, draft.fotos.length)] ?? "";
  const draftActivePhoto = draft.fotos[normalizeCoverIndex(draftPhotoIdx, draft.fotos.length)] ?? draftCover;
  const draftDescricao =
    draft.descricaoOlx ||
    draft.descricaoMarketplace ||
    draft.descricaoWhatsapp ||
    "";

  const getShareText = (veiculo: {
    modelo: string;
    ano: string;
    valorVenda: string;
    tituloAnuncio?: string;
    descricaoOlx?: string;
    descricaoMarketplace?: string;
    descricaoWhatsapp?: string;
  }, channel: ShareChannel) => {
    const titulo = veiculo.tituloAnuncio || fallbackTitle(veiculo.modelo, veiculo.ano, veiculo.valorVenda);
    const descricaoBase =
      veiculo.descricaoOlx ||
      veiculo.descricaoMarketplace ||
      veiculo.descricaoWhatsapp ||
      fallbackOlx(veiculo.modelo, veiculo.ano, veiculo.valorVenda);
    if (channel === "whatsapp") return `${titulo}\n\n${veiculo.descricaoWhatsapp || descricaoBase}`;
    if (channel === "marketplace") return `${titulo}\n\n${veiculo.descricaoMarketplace || descricaoBase}`;
    return `${titulo}\n\n${descricaoBase}`;
  };

  const getPackFiles = async (veiculo: Veiculo) => {
    const publication = getPublicationPhotoIndices(veiculo);
    const publicationPhotos = [
      { foto: veiculo.fotos[publication.capa], role: "capa" },
      { foto: veiculo.fotos[publication.destaque], role: "destaque" },
    ].filter((item, index, arr) => Boolean(item.foto) && arr.findIndex((other) => other.foto === item.foto) === index);

    return Promise.all(
      publicationPhotos.map(({ foto, role }, index) =>
        buildProcessedPhotoFile(
          foto,
          veiculo.ajustesFoto ?? defaultAjustes,
          `${String(index + 1).padStart(2, "0")}-${veiculo.modelo.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || "veiculo"}-${role}.jpg`
        )
      )
    );
  };

  const getChannelActionLabel = (channel: ShareChannel) => {
    if (channel === "marketplace") return "Abrir Marketplace";
    if (channel === "whatsapp") return "Abrir WhatsApp";
    return "Preparar anuncio";
  };

  const downloadPack = async (veiculo: Veiculo) => {
    const files = await getPackFiles(veiculo);
    files.forEach((file, index) => {
      setTimeout(() => {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        document.body.appendChild(link);
        link.href = url;
        link.download = file.name;
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, index * 220);
    });
  };

  const handleChannelAction = async (veiculo: Veiculo, channel: ShareChannel) => {
    const text = getShareText(veiculo, channel);
    const titulo = veiculo.tituloAnuncio || fallbackTitle(veiculo.modelo, veiculo.ano, veiculo.valorVenda);
    const marketplaceText = `${titulo}\n\n${text}`.trim();

    setIsPreparingShare(true);
    try {
      if (channel === "whatsapp") {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
        return;
      }

      if (channel === "marketplace") {
        await tryWriteTextSafe(marketplaceText);
        window.open("https://www.facebook.com/marketplace/", "_blank");
        return;
      }

      await tryWriteTextSafe(marketplaceText);
      window.open("https://www.olx.com.br/", "_blank");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Nao foi possivel preparar o compartilhamento.");
    } finally {
      setIsPreparingShare(false);
    }
  };

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Estoque</h1>
            <p className="text-white/30 text-sm mt-1">{resumoEstoque}</p>
          </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["ativos", "arquivados", "lixeira"] as EstoqueViewMode[]).map((mode) => (
            <Button key={mode} variant={viewMode === mode ? "default" : "outline"} size="sm" onClick={() => setViewMode(mode)}>
              {mode === "ativos" ? "Ativos" : mode === "arquivados" ? "Arquivados" : "Lixeira"}{" "}
              <span className="ml-1 opacity-70">{counts[mode]}</span>
            </Button>
          ))}
          {viewMode === "lixeira" && counts.lixeira > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClearTrash}>
              <Trash2 className="h-4 w-4 mr-1" /> Excluir tudo
            </Button>
          )}
          {viewMode === "ativos" && (
            <Button onClick={() => { resetDraft(); setShowNew(true); }} className="card-gradient-blue shadow-lg shadow-blue-500/20 text-white font-bold px-6">
              <Plus className="h-5 w-5 mr-2" /> Novo veiculo
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            placeholder="Buscar por modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "todos", label: "Todos", count: visibleVeiculos.length },
            { key: "disponivel", label: "Disponivel", count: totalDisponivel },
            { key: "reservado", label: "Reservado", count: totalReservado },
            { key: "vendido", label: "Vendido", count: totalVendido },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilterStatus(item.key)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                filterStatus === item.key
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                  : "bg-white/5 text-white/40 border border-white/5 hover:bg-white/10 hover:text-white/60"
              }`}
            >
              {item.label} <span className="ml-1 opacity-60">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {visibleVeiculos.map((veiculo) => {
          const st = statusConfig[veiculo.status];
          const coverIndex = normalizeCoverIndex(veiculo.fotoCapaIndex ?? 0, veiculo.fotos.length);
          const hasCoverPhoto = veiculo.fotos.length > 0 && Boolean(veiculo.fotos[coverIndex]);
          return (
            <div
              key={veiculo.id}
              className="rounded-2xl bg-[hsl(230,18%,11%)] border border-white/5 overflow-hidden cursor-pointer group hover:border-blue-500/20 transition-all duration-200"
              onClick={() => {
                setShowDetail(veiculo);
                setDetailPhotoIdx(normalizeCoverIndex(veiculo.fotoCapaIndex ?? 0, veiculo.fotos.length));
              }}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-white/5">
                {hasCoverPhoto ? (
                  <img
                    src={veiculo.fotos[coverIndex]}
                    alt={veiculo.modelo}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    style={{ filter: filtersFromAjustes(veiculo.ajustesFoto ?? defaultAjustes) }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 bg-[hsl(230,18%,9%)]">
                    <div className="flex flex-col items-center gap-2">
                      <Car className="h-8 w-8" />
                      <span className="text-xs">Sem foto</span>
                    </div>
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.bg}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </div>
                </div>
                {veiculo.fotos.length > 1 && (
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                    +{veiculo.fotos.length - 1}
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm truncate">{veiculo.modelo}</p>
                      <p className="text-white/35 text-xs mt-1">{`${veiculo.ano} \u2022 ${diasEmEstoque(veiculo.createdAt)} dias`}</p>
                      {veiculo.origem === "simulacao_custos" && (
                        <div className="mt-1.5">
                          <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                            Simulacao de custo
                          </span>
                        </div>
                      )}
                      {(veiculo.leilao || veiculo.sinistro) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {veiculo.leilao && (
                            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                              Leilao
                            </span>
                          )}
                          {veiculo.sinistro && (
                            <span className="rounded-full border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                              Sinistro
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDetail(veiculo);
                      setDetailPhotoIdx(normalizeCoverIndex(veiculo.fotoCapaIndex ?? 0, veiculo.fotos.length));
                    }}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/55 hover:text-white hover:bg-white/5"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <p className="text-white font-extrabold text-lg">{veiculo.valorVenda}</p>
                </div>

                <div className="flex gap-2 mt-4">
                  {!veiculo.archivedAt && !veiculo.deletedAt ? (
                    <>
                      <button type="button" onClick={(e) => { e.stopPropagation(); archiveVeiculo(veiculo.id); }} className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">
                        Arquivar
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); trashVeiculo(veiculo.id); }} className="flex-1 rounded-xl border border-red-500/20 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
                        Lixeira
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={(e) => { e.stopPropagation(); restoreVeiculo(veiculo.id); }} className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">
                      Restaurar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {visibleVeiculos.length === 0 && (
          <div className="col-span-full py-16 text-center">
            <Car className="h-12 w-12 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">
              {viewMode === "ativos" && "Nenhum veiculo encontrado"}
              {viewMode === "arquivados" && "Nenhum veiculo arquivado"}
              {viewMode === "lixeira" && "A lixeira esta vazia"}
            </p>
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={(open) => { if (!open) resetDraft(); setShowNew(open); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-1.5rem)] max-w-4xl max-h-[92dvh] overflow-y-auto bg-[hsl(230,18%,11%)] border-white/10 p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Novo veiculo</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-semibold">Fotos</p>
                    <p className="text-white/35 text-sm">Upload e comparacao entre original e tratada.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="border-white/10 text-white/70">
                    <ImagePlus className="h-4 w-4 mr-2" /> Adicionar
                  </Button>
                </div>

                <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={(e) => handlePhotoUpload(e.target.files)} className="hidden" />

                {draft.fotos.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2 mt-3 sm:mt-4">
                      {(["comparar", "original", "tratada"] as CompareMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCompareMode(mode)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                            compareMode === mode
                              ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                              : "bg-white/5 text-white/45 border border-white/10"
                          }`}
                        >
                          {mode === "comparar" ? "Comparar" : mode === "original" ? "Original" : "Tratada"}
                        </button>
                      ))}
                    </div>

                    <div className={`grid gap-3 sm:gap-4 mt-3 sm:mt-4 ${compareMode === "comparar" ? "md:grid-cols-2" : "grid-cols-1"}`}>
                      {(compareMode === "comparar" ? ["original", "tratada"] : [compareMode]).map((mode) => (
                        <div key={mode} className="rounded-2xl overflow-hidden border border-white/10 bg-[hsl(230,18%,9%)]">
                          <div className="aspect-[4/3] sm:aspect-[16/11] relative bg-white/5">
                            <img src={draftActivePhoto} alt={draft.modelo || "Preview"} className="w-full h-full object-cover" style={{ filter: mode === "tratada" ? filtersFromAjustes(draft.ajustesFoto) : undefined }} />
                            <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                              {mode === "tratada" ? "Tratada" : "Original"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                      <div className="flex flex-wrap gap-2 mt-3 sm:mt-4">
                        {draft.fotos.map((photo, index) => (
                          <button
                            key={`${photo.slice(0, 20)}-${index}`}
                            type="button"
                            onClick={() => setDraftPhotoIdx(index)}
                            className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border transition-all ${
                              draftPhotoIdx === index ? "border-blue-400 ring-2 ring-blue-500/20" : "border-white/10"
                            }`}
                          >
                            <img src={photo} alt="" className="w-full h-full object-cover" style={{ filter: filtersFromAjustes(draft.ajustesFoto) }} />
                            {index === draft.fotoCapaIndex && <span className="absolute bottom-1 left-1 bg-blue-500 text-white text-[8px] font-bold px-1 rounded">CAPA</span>}
                          </button>
                        ))}
                      </div>
                      {draft.fotos.length > 1 && (
                        <div className="grid grid-cols-3 mt-3 gap-2">
                          <Button variant="outline" size="sm" onClick={() => setDraftPhotoIdx((prev) => normalizeCoverIndex(prev - 1 < 0 ? draft.fotos.length - 1 : prev - 1, draft.fotos.length))} className="border-white/10 text-white/70">
                            <ChevronLeft className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Anterior</span>
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => updateDraft("fotoCapaIndex", draftPhotoIdx)} className="border-white/10 text-white/70">
                            <span className="truncate">Definir capa</span>
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setDraftPhotoIdx((prev) => normalizeCoverIndex((prev + 1) % draft.fotos.length, draft.fotos.length))} className="border-white/10 text-white/70">
                            <span className="hidden sm:inline">Proxima</span> <ChevronRight className="h-4 w-4 sm:ml-1" />
                          </Button>
                        </div>
                      )}
                      <div className="mt-3 sm:mt-4 rounded-2xl border border-white/10 bg-[hsl(230,18%,9%)] p-3">
                        <p className="text-xs text-white/45">
                          Tratamento automatico aplicado: enquadramento visual preservado, com ajuste leve de brilho, contraste, cor e nitidez.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 sm:mt-4 rounded-2xl border border-dashed border-white/10 p-6 sm:p-10 text-center">
                    <ImagePlus className="h-8 w-8 text-white/20 mx-auto mb-3" />
                    <p className="text-white/35 text-sm">Adicione fotos para montar o preview.</p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <p className="text-white font-semibold mb-3">Dados do veiculo</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Input value={draft.modelo} onChange={(e) => updateDraft("modelo", e.target.value)} placeholder="Ex: Honda Civic Touring 1.5 Turbo" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                  </div>
                  <Input value={draft.ano} onChange={(e) => updateDraft("ano", e.target.value)} placeholder="Ano" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                  <Input value={draft.valorVenda} onChange={(e) => updateDraft("valorVenda", e.target.value)} placeholder="Valor de venda" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                  <Input value={draft.km} onChange={(e) => updateDraft("km", e.target.value)} placeholder="KM" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                  <Input value={draft.cor} onChange={(e) => updateDraft("cor", e.target.value)} placeholder="Cor" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                  <Input value={draft.cambio} onChange={(e) => updateDraft("cambio", e.target.value)} placeholder="Cambio" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                  <Select value={draft.multimidia} onValueChange={(value: "" | "sim" | "nao") => updateDraft("multimidia", value)}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Multimidia" />
                    </SelectTrigger>
                    <SelectContent className="bg-[hsl(230,18%,11%)] border-white/10 text-white">
                      <SelectItem value="sim">Multimidia: sim</SelectItem>
                      <SelectItem value="nao">Multimidia: nao</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="md:col-span-2 flex items-center gap-4">
                    <label className="inline-flex items-center gap-1.5 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={draft.leilao}
                        onChange={(e) => updateDraft("leilao", e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-amber-400"
                      />
                      Leilao
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={draft.sinistro}
                        onChange={(e) => updateDraft("sinistro", e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-red-400"
                      />
                      Sinistro
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-semibold">Descricao com IA</p>
                  <Button variant="outline" size="sm" onClick={generateWithAI} disabled={isGenerating} className="border-purple-500/25 text-purple-300">
                    {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Gerar
                  </Button>
                </div>

                <div className="space-y-3 mt-4">
                  <Input
                    value={draft.tituloAnuncio}
                    onChange={(e) => updateDraft("tituloAnuncio", e.target.value)}
                    placeholder={draft.modelo ? fallbackTitle(draft.modelo, draft.ano, draft.valorVenda, draftFacts) : "Titulo do anuncio"}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Textarea
                    value={draftDescricao}
                    onChange={(e) => {
                      patchDraft({
                        descricaoOlx: e.target.value,
                        descricaoMarketplace: e.target.value,
                        descricaoWhatsapp: e.target.value,
                      });
                    }}
                    placeholder="Clique em Gerar para a IA montar a descricao completa do veiculo."
                    className="bg-white/5 border-white/10 text-white min-h-[160px] sm:min-h-[220px]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={saveDraft} className="flex-1 card-gradient-blue text-white font-bold">
                  <Sparkles className="h-4 w-4 mr-2" /> Salvar veiculo
                </Button>
                <Button variant="outline" onClick={() => { setShowNew(false); resetDraft(); }} className="border-white/10 text-white/70">
                  Cancelar
                </Button>
              </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="w-[calc(100vw-0.5rem)] sm:w-[calc(100vw-1.5rem)] max-w-5xl h-[94dvh] overflow-hidden p-0 bg-[hsl(230,18%,11%)] border-white/10">
          {showDetail && (
            <div className="grid h-full items-start lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              {(() => {
                const publication = getPublicationPhotoIndices(showDetail);
                const coverIndex = publication.capa;
                const destaqueIndex = publication.destaque;
                return (
                  <>
              <div className="relative flex flex-col self-start border-b border-white/5 bg-white/5 lg:h-full lg:border-b-0 lg:border-r">
                <div className="flex min-h-[300px] flex-1 items-center justify-center bg-[hsl(230,18%,9%)] p-2 sm:p-4">
                  <img
                    src={showDetail.fotos[detailPhotoIdx]}
                    alt={showDetail.modelo}
                    className="max-h-[42dvh] w-full rounded-xl object-contain sm:max-h-[56dvh] lg:max-h-[72dvh]"
                    style={{ filter: filtersFromAjustes(showDetail.ajustesFoto ?? defaultAjustes) }}
                  />
                </div>
                {showDetail.fotos.length > 1 && (
                  <>
                    <button onClick={() => setDetailPhotoIdx((prev) => (prev - 1 + showDetail.fotos.length) % showDetail.fotos.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDetailPhotoIdx((prev) => (prev + 1) % showDetail.fotos.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
                {showDetail.fotos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto border-t border-white/5 bg-[hsl(230,18%,10%)] px-2 sm:px-3 py-2">
                    {showDetail.fotos.map((foto, index) => (
                      <button
                        key={`${showDetail.id}-thumb-${index}`}
                        type="button"
                        onClick={() => setDetailPhotoIdx(index)}
                        className={`relative h-12 w-12 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border transition-all ${
                          detailPhotoIdx === index ? "border-blue-400 ring-2 ring-blue-500/20" : "border-white/10"
                        }`}
                      >
                        <img
                          src={foto}
                          alt=""
                          className="h-full w-full object-cover"
                          style={{ filter: filtersFromAjustes(showDetail.ajustesFoto ?? defaultAjustes) }}
                        />
                        {index === coverIndex && (
                          <span className="absolute bottom-1 left-1 rounded bg-blue-500 px-1 text-[8px] font-bold text-white">
                            CAPA
                          </span>
                        )}
                        {index === destaqueIndex && index !== coverIndex && (
                          <span className="absolute bottom-1 right-1 rounded bg-emerald-500 px-1 text-[8px] font-bold text-white">
                            TOP 2
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="max-h-[94dvh] overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-white">{showDetail.modelo}</h2>
                    <p className="text-white/35 text-xs sm:text-sm mt-1">{showDetail.ano} • {diasEmEstoque(showDetail.createdAt)} dias em estoque</p>
                    {(showDetail.leilao || showDetail.sinistro) && (
                      <div className="mt-2 flex items-center gap-2">
                        {showDetail.leilao && (
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            Leilao
                          </span>
                        )}
                        {showDetail.sinistro && (
                          <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                            Sinistro
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className={statusConfig[showDetail.status].bg}>
                    {statusConfig[showDetail.status].label}
                  </Badge>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <p className="text-white/35 text-[11px] uppercase tracking-[0.16em]">Venda</p>
                  <p className="text-white font-bold text-base mt-1">{showDetail.valorVenda}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/35 text-[11px] font-bold uppercase tracking-[0.2em]">
                        Titulo do anuncio
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-white/45 hover:text-white hover:bg-white/5 shrink-0"
                        onClick={() =>
                          writeTextSafe(showDetail.tituloAnuncio || fallbackTitle(showDetail.modelo, showDetail.ano, showDetail.valorVenda))
                            .then((copied) => toast.success(copied ? "Titulo copiado" : "Titulo preparado"))
                        }
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                      </Button>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <p className="text-white font-bold">
                        {showDetail.tituloAnuncio || fallbackTitle(showDetail.modelo, showDetail.ano, showDetail.valorVenda)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white/35 text-[11px] font-bold uppercase tracking-[0.2em]">
                        Descricao
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-white/45 hover:text-white hover:bg-white/5 shrink-0"
                        onClick={() =>
                          writeTextSafe(
                              showDetail.descricaoOlx ||
                              showDetail.descricaoMarketplace ||
                              showDetail.descricaoWhatsapp ||
                              fallbackOlx(showDetail.modelo, showDetail.ano, showDetail.valorVenda, {
                                km: showDetail.km,
                                cor: showDetail.cor,
                                cambio: showDetail.cambio,
                                multimidia: showDetail.multimidia ?? "",
                              })
                            )
                            .then((copied) => toast.success(copied ? "Descricao copiada" : "Descricao preparada"))
                        }
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                      </Button>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <p className="text-white/55 text-sm whitespace-pre-wrap">
                        {showDetail.descricaoOlx || showDetail.descricaoMarketplace || showDetail.descricaoWhatsapp || fallbackOlx(showDetail.modelo, showDetail.ano, showDetail.valorVenda, {
                          km: showDetail.km,
                          cor: showDetail.cor,
                          cambio: showDetail.cambio,
                          multimidia: showDetail.multimidia ?? "",
                        })}
                      </p>
                    </div>
                  </div>

                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-white font-semibold">Publicacao</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadPack(showDetail).then(() =>
                          toast.success("Baixando 2 fotos principais: capa e destaque")
                        )
                      }
                      className="border-white/10 text-white/70 hover:text-white hover:bg-white/5 shrink-0"
                    >
                      <Download className="h-4 w-4 mr-2" /> Fotos
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr] gap-2">
                    <Select value={shareChannel} onValueChange={(value: ShareChannel) => setShareChannel(value)}>
                      <SelectTrigger className="w-full h-9 bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[hsl(230,18%,13%)] border-white/10">
                        <SelectItem value="whatsapp" className="text-white">WhatsApp</SelectItem>
                        <SelectItem value="marketplace" className="text-white">Marketplace</SelectItem>
                        <SelectItem value="olx" className="text-white">OLX</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="w-full border-white/10 text-white/70 hover:text-white hover:bg-white/5" onClick={() => writeTextSafe(getShareText(showDetail, shareChannel)).then((copied) => toast.success(copied ? "Texto copiado" : "Texto preparado"))}>
                      <Copy className="h-4 w-4 mr-2" /> Copiar texto
                    </Button>
                    <Button
                      variant={shareChannel === "marketplace" ? "default" : "outline"}
                      size="sm"
                      className={
                        shareChannel === "marketplace"
                          ? "w-full bg-emerald-500 hover:bg-emerald-400 text-white"
                          : "w-full border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                      }
                      onClick={() => handleChannelAction(showDetail, shareChannel)}
                      disabled={isPreparingShare}
                    >
                      {isPreparingShare ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : shareChannel === "marketplace" ? (
                        <ExternalLink className="h-4 w-4 mr-2" />
                      ) : (
                        <Share2 className="h-4 w-4 mr-2" />
                      )}
                      {getChannelActionLabel(shareChannel)}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {!showDetail.archivedAt && !showDetail.deletedAt && showDetail.status === "disponivel" && (
                    <MarcarVendido veiculo={showDetail} vendedores={vendedores} onVendido={() => setShowDetail(null)} />
                  )}
                  {!showDetail.archivedAt && !showDetail.deletedAt && showDetail.status === "reservado" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateVeiculo(showDetail.id, { status: "disponivel" });
                        setShowDetail(null);
                      }}
                      className="border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" /> Liberar reserva
                    </Button>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap pt-2 border-t border-white/5">
                  {!showDetail.archivedAt && !showDetail.deletedAt && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => { archiveVeiculo(showDetail.id); setShowDetail(null); }} className="border-white/10 text-white/70">
                        <Archive className="h-4 w-4 mr-2" /> Arquivar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => { trashVeiculo(showDetail.id); setShowDetail(null); }}>
                        <Trash2 className="h-4 w-4 mr-2" /> Lixeira
                      </Button>
                    </>
                  )}
                  {(showDetail.archivedAt || showDetail.deletedAt) && (
                    <Button variant="outline" size="sm" onClick={() => { restoreVeiculo(showDetail.id); setShowDetail(null); }} className="border-white/10 text-white/70">
                      <RotateCcw className="h-4 w-4 mr-2" /> Restaurar
                    </Button>
                  )}
                  {showDetail.deletedAt && (
                    <Button variant="destructive" size="sm" onClick={() => handlePermanentDelete(showDetail)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
