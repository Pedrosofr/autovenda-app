/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import { 
  motion, 
  useScroll, 
  useTransform, 
  useSpring, 
  useMotionValue, 
  AnimatePresence,
  useInView
} from "motion/react";
import { useNavigate } from "react-router-dom";
import { 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  Check, 
  ArrowRight, 
  Car, 
  Megaphone, 
  CircleDollarSign, 
  FileText, 
  Users, 
  ClipboardCheck,
  Star,
  Quote,
  Menu,
  X,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// --- Hooks ---

function useMousePosition() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return { mouseX, mouseY };
}

// --- Components ---

const MouseFollower = () => {
  const { mouseX, mouseY } = useMousePosition();
  const springConfig = { damping: 25, stiffness: 150 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  return (
    <motion.div
      className="fixed inset-0 pointer-events-none z-0 hidden md:block"
      style={{
        x: useTransform(x, (val) => val - 300),
        y: useTransform(y, (val) => val - 300),
      }}
    >
      <div className="w-[600px] h-[600px] rounded-full bg-accent/7 blur-[80px]" />
    </motion.div>
  );
};

const GridBackground = () => (
  <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
    <div className="absolute inset-0 grid-background" />
    <div className="absolute inset-0 grid-dots" />
    <div className="absolute inset-0 bg-gradient-to-b from-background via-background/50 to-background opacity-90" />
    <svg className="hidden">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
    </svg>
    <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" style={{ filter: 'url(#noise)' }} />
  </div>
);

const GradientOrb = ({ className, delay = 0, parallaxFactor = 0.3 }: { className?: string; delay?: number; parallaxFactor?: number }) => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [0, 1000 * parallaxFactor]);

  return (
    <motion.div
      className={cn("absolute rounded-full blur-[100px] pointer-events-none", className)}
      style={{ y }}
      animate={{
        y: [0, 30, 0],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
};

const SectionHeader = ({ title, subtitle, badge, className }: { title: string; subtitle?: string; badge?: string; className?: string }) => {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div ref={ref} className={cn("text-center mb-20 space-y-6", className)}>
      {badge && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="outline" className="border-accent/20 bg-accent/5 text-accent px-6 py-1.5 rounded-full font-semibold tracking-wide uppercase text-[10px]">
            {badge}
          </Badge>
        </motion.div>
      )}
      <motion.h2
        className="text-4xl md:text-6xl font-display font-bold tracking-tight text-foreground"
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          className={cn("text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto leading-relaxed", className?.includes("text-left") && "mx-0")}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
};

const SpotlightCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = React.useState(0);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn(
        "relative group overflow-hidden rounded-2xl border border-white/[0.08] bg-background/25 p-8 transition-all hover:bg-white/[0.06] hover:border-accent/40 shadow-none hover:shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_50px_rgba(var(--color-accent),0.1)] hover:-translate-y-2",
        "duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px transition duration-300"
        style={{
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, rgba(var(--color-accent), 0.1), transparent 80%)`,
          opacity,
        }}
      />
      {children}
    </div>
  );
};

const PremiumButton = ({ children, className, href, ...props }: any) => {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);

  const handleClick = (e: React.MouseEvent) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (href) {
        if (href.startsWith("http")) window.location.href = href;
        else navigate(href);
      }
    }, 1500);
    if (props.onClick) props.onClick(e);
  };

  return (
    <Button
      {...props}
      onClick={handleClick}
      disabled={loading || props.disabled}
      className={cn("relative group overflow-hidden transition-all duration-500", className)}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2"
          >
            <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
            Preparando...
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  );
};

const Navbar = () => {
  const [isScrolled, setIsScrolled] = React.useState(false);
  const { scrollYProgress } = useScroll();

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled ? "glass py-3" : "bg-transparent py-6"
      )}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="w-9 h-9 bg-gradient-to-br from-accent to-emerald-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(var(--color-accent),0.3)] group-hover:shadow-[0_0_30px_rgba(var(--color-accent),0.5)] transition-all duration-500">
            <Car className="w-5 h-5 text-accent-foreground" />
          </div>
          <span className="text-xl font-display font-bold tracking-tight text-foreground/90 group-hover:text-foreground transition-colors">
            Rozz <span className="text-accent">car</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-10">
          {["Funcionalidades", "Diferenciais", "Depoimentos", "Preços", "FAQ"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-[13px] font-semibold text-foreground/60 hover:text-accent transition-all duration-300 relative group tracking-wide uppercase"
            >
              {item}
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-accent rounded-full transition-all duration-300 group-hover:w-1.5" />
            </a>
          ))}
        </div>

        <div className="flex items-center gap-5">
          <PremiumButton href="/login" variant="ghost" className="hidden sm:inline-flex text-sm font-semibold text-foreground/70 hover:text-foreground hover:bg-white/5">Entrar</PremiumButton>
          <PremiumButton href="/login?signup=1" className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-[0_8px_20px_-4px_rgba(var(--color-accent),0.4)] font-bold px-7 h-11 rounded-full">
            Testar Grátis
          </PremiumButton>
        </div>
      </div>
      <motion.div
        className="absolute bottom-0 left-0 h-[2px] bg-accent/50 shadow-[0_0_15px_rgba(var(--color-accent),0.4)]"
        style={{ scaleX: scrollYProgress, transformOrigin: "0%" }}
      />
    </motion.nav>
  );
};

const LeadBadge = () => {
  const [visible, setVisible] = React.useState(true);
  const leads = ["BMW 320i", "Toyota Corolla", "Honda Civic", "VW Golf", "Audi A3"];
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % leads.length);
        setVisible(true);
      }, 500);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key={leads[index]}
          initial={{ opacity: 0, x: 20, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -20, scale: 0.8 }}
          className="absolute top-10 right-10 bg-accent text-accent-foreground px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 z-20"
        >
          <Zap className="w-4 h-4" />
          Novo Lead: {leads[index]}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Hero = () => {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 150]);

  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      <GradientOrb className="top-20 right-[-10%] w-[600px] h-[600px] bg-accent opacity-10" />
      <GradientOrb className="bottom-0 left-[-5%] w-[500px] h-[500px] bg-indigo-500/10" delay={2} />
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="outline" className="border-accent/20 bg-accent/5 text-accent px-4 py-1 rounded-full font-medium">
              ✨ O sistema #1 para revendas de veículos
            </Badge>
          </motion.div>

          <div className="space-y-4">
            <motion.h1
              className="text-[2.75rem] md:text-7xl lg:text-8xl font-display font-extrabold tracking-tight leading-[1.05]"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.15 }
                }
              }}
            >
              {["Transforme", "sua", "revenda", "em", "uma"].map((word, i) => (
                <motion.span
                  key={i}
                  className="inline-block mr-[0.2em]"
                  variants={{
                    hidden: { opacity: 0, y: 20, clipPath: "inset(0 0 100% 0)" },
                    visible: { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }
                  }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                  {word}
                </motion.span>
              ))}
              <motion.span 
                className="text-gradient block md:inline"
                variants={{
                  hidden: { opacity: 0, y: 20, clipPath: "inset(0 0 100% 0)" },
                  visible: { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }
                }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              >
                máquina de vendas
              </motion.span>
            </motion.h1>
            <motion.p
              className="text-lg md:text-2xl text-muted-foreground/90 max-w-2xl mx-auto font-medium"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
            >
              Pare de perder vendas esquecidas e sofrer com burocracias. <strong className="text-foreground font-bold">CRM com Metas, Consultas de Placa, Emissão de NF-e e Multi-Anúncios.</strong> Tudo em 1 único sistema.
            </motion.p>
          </div>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 px-4 sm:px-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <PremiumButton href="/login?signup=1" size="lg" className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 h-14 px-8 text-lg font-bold shadow-[0_0_40px_rgba(var(--color-accent),0.25)] shimmer group">
              Começar Agora
              <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </PremiumButton>
            <PremiumButton size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg font-semibold border-white/10 hover:bg-white/5">
              Ver Demonstração
            </PremiumButton>
          </motion.div>
        </div>

        <motion.div
          className="mt-20 relative max-w-6xl mx-auto"
          initial={{ opacity: 0, scale: 0.95, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
          style={{ y: y1 }}
        >
          <div className="relative group perspective-[1200px]">
            <div className="relative rounded-2xl border border-white/[0.12] bg-background/25 backdrop-blur-2xl overflow-hidden shadow-[0_30px_100px_0_rgba(0,0,0,0.7)] transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:rotate-0 rotate-y-[-8deg] rotate-x-[4deg]">
              {/* Mockup Content */}
              <div className="flex h-[400px] md:h-[600px]">
                {/* Sidebar */}
                <div className="w-14 md:w-64 border-r border-white/5 bg-white/[0.02] p-2 md:p-4 flex flex-col gap-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-8 md:h-10 rounded-lg bg-white/5 flex items-center justify-center md:justify-start md:px-3 gap-3">
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded bg-white/10 shrink-0" />
                      <div className="hidden md:block h-3 w-24 bg-white/10 rounded" />
                    </div>
                  ))}
                </div>
                {/* Main Content */}
                <div className="flex-1 p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="h-8 w-48 bg-white/5 rounded" />
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/5" />
                      <div className="w-10 h-10 rounded-full bg-white/5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-48 rounded-xl bg-white/[0.03] border border-white/5 p-4 space-y-3">
                        <div className="h-24 w-full bg-gradient-to-br from-white/5 to-transparent rounded-lg" />
                        <div className="h-4 w-3/4 bg-white/10 rounded" />
                        <div className="h-4 w-1/2 bg-white/5 rounded" />
                      </div>
                    ))}
                  </div>
                  <div className="h-40 w-full bg-white/[0.02] border border-white/5 rounded-xl p-6 flex items-end gap-2">
                    {[40, 70, 45, 90, 65, 80, 55].map((h, i) => (
                      <div key={i} className="flex-1 bg-accent/20 rounded-t-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Floating Badge */}
              <LeadBadge />

              {/* Reflection */}
              <div className="absolute inset-x-0 -bottom-full h-full bg-gradient-to-t from-background via-transparent to-transparent opacity-20 blur-md pointer-events-none scale-y-[-1]" />
            </div>
            
            {/* Glow behind mockup */}
            <div className="absolute -inset-4 bg-accent/10 blur-3xl rounded-[2rem] z-[-1]" />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const PainPoints = () => {
  const pains = [
    {
      title: "Ralos de Dinheiro Invisíveis",
      desc: "Veículos com passagem por leilão ou multas ocultas na hora da compra. Sem consultar rápido, você coloca uma bomba no pátio.",
      icon: <ClipboardCheck className="w-6 h-6" />,
    },
    {
      title: "Vendedores Descontrolados",
      desc: "Quantos leads foram esquecidos no WhatsApp neste mês? Sem metas claras e histórico, você está rasgando orçamento de marketing.",
      icon: <Users className="w-6 h-6" />,
    },
    {
      title: "O Caos da Burocracia",
      desc: "Tempo perdido criando descrições manuais para anúncios, controlando custos reais no caderninho e sofrendo para emitir Nota Fiscal.",
      icon: <CircleDollarSign className="w-6 h-6" />,
    },
  ];

  return (
    <section id="funcionalidades" className="py-24 relative overflow-hidden">
      <GradientOrb className="bottom-0 left-[-10%] w-[400px] h-[400px] bg-blue-500 opacity-6" />
      <div className="container mx-auto px-6">
        <SectionHeader 
          badge="O Problema"
          title="Por que as revendas deixam tanto lucro na mesa?"
          subtitle="Vender carros dá dinheiro, mas as falhas de operação drenam seu caixa diariamente. Quantos desses erros você comete?"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <SpotlightCard>
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center text-accent mb-6 group-hover:rotate-12 group-hover:scale-125 transition-all duration-500 ease-out">
                  {pain.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{pain.title}</h3>
                <p className="text-muted-foreground">{pain.desc}</p>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Solution = () => {
  const features = [
    { title: "Consultas de Veículos (All-in-One)", desc: "Consulte leilão, débitos e restrições em um clique. Pare de depender de despachantes externos e feche compras blindadas.", icon: <ClipboardCheck />, anim: "animate-check-draw" },
    { title: "Gestão Ativa de Leads", desc: "Saiba quantos leads chegaram, veja quem os vendedores esqueceram e metrifique conversões. O cliente não esfria.", icon: <Users />, anim: "animate-bounce-scale" },
    { title: "Emissão de NF-e e Fiscal", desc: "Esqueça a contabilidade travada. Emita notas fiscais de venda diretamente na plataforma de forma rápida e segura.", icon: <FileText />, anim: "animate-doc-float" },
    { title: "Estoque & Multi-Anúncios", desc: "O sistema descreve o diferencial do carro pra você e anuncia nas principais plataformas de forma ágil e centralizada.", icon: <Megaphone />, anim: "animate-broadcast" },
    { title: "Custo Real & Financeiro", desc: "Controle juros, manutenção, descontos e comissão. Descubra o lucro exato e o DRE da sua operação em tempo real.", icon: <CircleDollarSign />, anim: "animate-coin-spin" },
    { title: "Cadastro Ultra Rápido", desc: "Apenas digite a placa e o módulo puxa todos os dados do veículo pra você ganhar horas de trabalho semanal.", icon: <Car />, anim: "animate-car-move" },
  ];

  return (
    <section className="py-24 bg-white/[0.01]">
      <div className="container mx-auto px-6">
        <SectionHeader 
          badge="Nossa Plataforma (Plataforma Completa B2B)"
          title="Controle Absoluto. Tudo em 1."
          subtitle="Desenvolvemos a AutoVenda Pro focada no bolso do lojista. Eliminamos softwares paralelos para você operar com maestria."
        />
        <motion.div 
          className="rounded-[2.5rem] overflow-hidden border border-white/10 bg-white/[0.01] grid grid-cols-1 md:grid-cols-3 gap-[1px]"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.15
              }
            }
          }}
        >
          {features.map((f, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, x: -30 },
                visible: { opacity: 1, x: 0 }
              }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <SpotlightCard className="rounded-none border-none bg-transparent hover:bg-white/[0.03] p-10 h-full">
                <div className={cn("w-10 h-10 text-accent mb-6 transition-all duration-500", f.anim)}>
                  {React.cloneElement(f.icon as React.ReactElement<any>, { size: 32 })}
                </div>
                <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </SpotlightCard>
            </motion.div>
          ))}
        </motion.div>

        <motion.div 
          className="mt-12 flex flex-wrap justify-center gap-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
        >
          {["Contratos Automáticos", "App para Vendedores", "Relatórios PDF", "Suporte VIP", "Backup em Nuvem"].map((item, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 }
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="px-4 py-2 rounded-full bg-accent/8 border border-accent/15 text-xs font-semibold text-accent hover:bg-accent/15 transition-colors cursor-default"
            >
              {item}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

const Differentials = () => {
  const diffs = [
    { id: "01", title: "Basta de 'Picadinho' de Sistemas", desc: "Consultas veiculares detalhadas, emissão de nota fiscal (NF-e), DRE e gestão de pátio em uma tela só. Cancele ferramentas isoladas e tenha o ecossistema perfeito." },
    { id: "02", title: "Gestão Visível de Vendedores", desc: "Tenha clareza real de quantos leads chegaram no mês e quais negócios estão parados. Estabeleça metas e deixe o sistema cobrar o comercial por você." },
    { id: "03", title: "O Estoque que se Vende Sozinho", desc: "Cadastrou? A plataforma redige os detalhes e turbina a descrição de forma impecável, espalhando os anúncios para as maiores plataformas de classificados instantaneamente." },
  ];

  return (
    <section id="diferenciais" className="py-24 relative">
      <div className="container mx-auto px-6">
        <div className="space-y-0">
          {diffs.map((d, i) => (
            <motion.div
              key={i}
              className="relative py-16 group border-b border-white/5 last:border-0"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.2 }}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-8 relative z-10">
                <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center text-accent shrink-0">
                  <Star className="w-8 h-8" />
                </div>
                <div className="max-w-2xl">
                  <h3 className="text-2xl font-bold mb-4">{d.title}</h3>
                  <p className="text-muted-foreground text-lg">{d.desc}</p>
                </div>
              </div>
              <span className="absolute top-1/2 -translate-y-1/2 right-0 text-8xl md:text-[10rem] font-extrabold text-white/[0.03] group-hover:text-accent/[0.06] transition-all duration-500 pointer-events-none">
                {d.id}
              </span>
              <motion.div 
                className="absolute bottom-0 left-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Counter = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
  const [count, setCount] = React.useState(0);
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true });

  React.useEffect(() => {
    if (isInView) {
      let start = 0;
      const end = value;
      const duration = 2000;
      const increment = end / (duration / 16);
      
      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCount(end);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);
      return () => clearInterval(timer);
    }
  }, [isInView, value]);

  return <span ref={ref}>{count}{suffix}</span>;
};

const Typewriter = ({ text, speed = 30 }: { text: string; speed?: number }) => {
  const [displayedText, setDisplayedText] = React.useState("");
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true });

  React.useEffect(() => {
    if (isInView) {
      let i = 0;
      const timer = setInterval(() => {
        setDisplayedText(text.slice(0, i + 1));
        i++;
        if (i === text.length) clearInterval(timer);
      }, speed);
      return () => clearInterval(timer);
    }
  }, [isInView, text, speed]);

  return (
    <span ref={ref} className="relative">
      {displayedText}
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="inline-block w-[2px] h-[1.2em] bg-accent ml-1 align-middle"
      />
    </span>
  );
};

const SocialProof = () => {
  const [page, setPage] = React.useState(0);
  const testimonials = [
    { 
      name: "João Pedro", 
      usage: "8 meses com a Rozz car",
      role: "JP Multimarcas", 
      location: "Curitiba/PR",
      text: "Cara, o que mudou o jogo aqui foi a consulta de placa. Eu perdia um tempão abrindo site de leilão, vendo débito... agora é um clique e já sei se o carro é bomba ou se vale a pena. Economizo fácil uns 40 minutos em cada avaliação que faço no pátio." 
    },
    { 
      name: "Luciana Costa", 
      usage: "1 ano com a Rozz car",
      role: "Elite Veículos", 
      location: "São Paulo/SP",
      text: "Minha maior dor era o financeiro, nunca sabia de verdade quanto sobrava no fim do mês por causa das comissões e custos que apareciam do nada. Com o sistema, o custo do carro tá ali na cara, o lucro sai real. Dá uma paz de espírito gigante saber pra onde o dinheiro tá indo." 
    },
    { 
      name: "Ricardo Almeida", 
      usage: "6 meses com a Rozz car",
      role: "Gerente de Estoque", 
      location: "Goiânia/GO",
      text: "A descrição automática é sacanagem de tão boa. Eu odiava escrever anúncio, sempre esquecia de algum opcional. Agora o sistema puxa tudo sozinho e monta um texto que vende. Meus anúncios ficaram muito mais profissionais e não perco mais tempo com isso." 
    },
    { 
      name: "Felipe Santos", 
      usage: "1 ano com a Rozz car",
      role: "FS Automóveis", 
      location: "Belo Horizonte/MG",
      text: "Ter tudo num app só facilitou demais. Faço a consulta, vejo o leilão, lanço o que gastei na oficina e já mando pro anúncio. Não preciso de mais nada, a Rozz car centralizou tudo. É prático, rápido e não trava, que era meu medo com outros sistemas." 
    },
    { 
      name: "Beatriz Silva", 
      usage: "9 meses com a Rozz car",
      role: "Diretora Comercial", 
      location: "Porto Alegre/RS",
      text: "O controle de pendência do pós-venda salvou a gente. Antes sempre ficava um documento pra trás ou uma manutençãozinha que a gente prometia e esquecia, aí o cliente reclamava. Agora o sistema avisa tudo, a gente resolve e o cliente sai feliz da vida." 
    },
    { 
      name: "Carlos Eduardo", 
      usage: "5 meses com a Rozz car",
      role: "Revendedor Autônomo", 
      location: "Rio de Janeiro/RJ",
      text: "Pra quem trabalha sozinho, tempo é literalmente dinheiro. Consultar débito e multa na hora que tô vendo o carro evita cada prejuízo que você não tem ideia. O app é leve, resolve tudo na palma da mão e o suporte dos caras é nota 10." 
    },
  ];

  const totalPages = Math.ceil(testimonials.length / 3);
  const currentTestimonials = testimonials.slice(page * 3, (page + 1) * 3);

  return (
    <section id="depoimentos" className="py-24 bg-white/[0.01] overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <SectionHeader 
            badge="Depoimentos Reais"
            title="O que os lojistas estão falando"
            subtitle="Linguagem de quem está no pátio todo dia, sem enrolação."
            className="text-left mx-0"
          />
          <div className="flex gap-3">
            <button 
              onClick={() => setPage(p => (p - 1 + totalPages) % totalPages)}
              className="w-12 h-12 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-all duration-300 group"
            >
              <ChevronLeft className="w-5 h-5 group-active:scale-90" />
            </button>
            <button 
              onClick={() => setPage(p => (p + 1) % totalPages)}
              className="w-12 h-12 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-all duration-300 group"
            >
              <ChevronRight className="w-5 h-5 group-active:scale-90" />
            </button>
          </div>
        </div>
        
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {currentTestimonials.map((t, i) => (
                <SpotlightCard key={i} className="flex flex-col h-full p-8 bg-white/[0.01] border-white/5 hover:bg-white/[0.03] transition-colors duration-500">
                  <div className="flex-grow">
                    <p className="text-[15px] text-foreground/80 leading-relaxed font-medium mb-8">
                      {t.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center font-bold text-accent shrink-0">
                      {t.name[0]}
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="font-bold text-sm whitespace-nowrap">{t.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-bold whitespace-nowrap">
                          {t.usage}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate font-medium">
                        {t.role} • {t.location}
                      </p>
                    </div>
                  </div>
                </SpotlightCard>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "Revendas Ativas", val: 180, suffix: "+" },
            { label: "Veículos Cadastrados", val: 8, suffix: "k+" },
            { label: "Tempo Economizado", val: 3, suffix: "h/dia" },
            { label: "Aumento em Margem", val: 22, suffix: "%" },
          ].map((m, i) => (
            <div key={i} className="text-center space-y-2 relative">
              <div className="text-4xl md:text-5xl font-display font-bold text-accent">
                <Counter value={m.val} suffix={m.suffix} />
              </div>
              <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">{m.label}</p>
              {i < 3 && <div className="hidden md:block absolute right-[-15%] top-1/2 -translate-y-1/2 w-[1px] h-10 bg-white/10" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Pricing = () => {
  const [isAnnual, setIsAnnual] = React.useState(true);

  const plans = [
    { 
      name: "Start", 
      price: isAnnual ? "197" : "247", 
      desc: "Para lojas pequenas começando agora.",
      features: ["Até 20 veículos", "CRM Básico", "Financeiro", "1 Usuário"],
      popular: false
    },
    { 
      name: "Pro", 
      price: isAnnual ? "397" : "497", 
      desc: "O plano ideal para revendas em crescimento.",
      features: ["Estoque Ilimitado", "CRM Avançado", "NF-e Ilimitada", "5 Usuários", "Suporte VIP"],
      popular: true
    },
    { 
      name: "Elite", 
      price: isAnnual ? "797" : "997", 
      desc: "Para redes de lojas e grandes operações.",
      features: ["Multi-lojas", "API de Integração", "RENAVE", "Usuários Ilimitados", "Gerente de Conta"],
      popular: false
    },
  ];

  return (
    <section id="preços" className="py-24 relative overflow-hidden">
      <GradientOrb className="top-1/2 right-[-10%] w-[350px] h-[350px] bg-accent opacity-5" />
      <div className="container mx-auto px-6">
        <SectionHeader 
          badge="Preços"
          title="O investimento que se paga sozinho"
          subtitle="Escolha o plano ideal para o momento da sua loja."
        />

        <div className="flex items-center justify-center gap-4 mb-16">
          <span className={cn("text-sm font-medium transition-colors", !isAnnual ? "text-foreground" : "text-muted-foreground")}>Mensal</span>
          <Switch checked={isAnnual} onCheckedChange={setIsAnnual} className="data-[state=checked]:bg-accent" />
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium transition-colors", isAnnual ? "text-foreground" : "text-muted-foreground")}>Anual</span>
            <Badge className="bg-accent/10 text-accent border-accent/20 animate-pulse">Economize 20%</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {plans.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "relative rounded-[2.5rem] p-8 md:p-10 transition-all duration-500 hover:-translate-y-2 group",
                p.popular 
                  ? "bg-white/[0.03] border border-accent/30 md:scale-105 z-10 shadow-[0_20px_80px_rgba(0,0,0,0.4),0_0_40px_rgba(var(--color-accent),0.05)] mt-4 md:mt-0" 
                  : "bg-white/[0.015] border border-white/5"
              )}
            >
              {p.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground px-6 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase shadow-[0_4px_20px_rgba(var(--color-accent),0.3)]">
                  RECOMENDADO
                </div>
              )}
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                <p className="text-sm text-muted-foreground mb-6">{p.desc}</p>
                <div className="flex items-baseline gap-1 h-10">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={p.price}
                      initial={{ rotateX: -90, opacity: 0 }}
                      animate={{ rotateX: 0, opacity: 1 }}
                      exit={{ rotateX: 90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-4xl font-display font-bold"
                    >
                      R$ {p.price}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8">
                {p.features.map((f, j) => (
                  <motion.li 
                    key={j} 
                    className="flex items-center gap-3 text-sm"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 + j * 0.08 }}
                  >
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                      <Check className="w-3 h-3" />
                    </div>
                    {f}
                  </motion.li>
                ))}
              </ul>
              <PremiumButton href={`/login?plan=${p.name.toLowerCase()}`} className={cn("w-full h-12 font-bold", p.popular ? "bg-accent text-accent-foreground hover:bg-accent/90" : "bg-white/5 hover:bg-white/10")}>
                Assinar Agora
              </PremiumButton>
              {p.popular && <div className="absolute -inset-4 bg-accent/5 blur-3xl rounded-[2rem] z-[-1]" />}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const FAQ = () => {
  const faqs = [
    { q: "Preciso instalar algum programa?", a: "Não! O AutoVenda Pro é 100% em nuvem. Você acessa pelo navegador de qualquer dispositivo." },
    { q: "Como funciona a migração de dados?", a: "Nossa equipe técnica cuida de tudo. Importamos seus dados de planilhas ou outros sistemas sem custo adicional." },
    { q: "Tenho suporte se precisar de ajuda?", a: "Sim! Oferecemos suporte humanizado via WhatsApp e chat em todos os planos." },
    { q: "Posso cancelar a qualquer momento?", a: "Sim, não temos fidelidade nos planos mensais. No anual, você garante o desconto e tem acesso por 12 meses." },
  ];

  return (
    <section id="faq" className="py-24">
      <div className="container mx-auto px-6 max-w-3xl">
        <SectionHeader 
          badge="FAQ"
          title="Dúvidas Frequentes"
          subtitle="Tudo o que você precisa saber para começar."
        />
        <Accordion {...({ type: "single", collapsible: true } as any)} className="w-full">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-white/10">
              <AccordionTrigger className="text-left hover:text-accent transition-colors py-6">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-6">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};

const FinalCTA = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-accent/5 z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/10 blur-[120px] rounded-full" />
      <div className="absolute inset-0 grid-background opacity-40" />
      
      {/* Floating particles */}
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white/10 rounded-full"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 5 + Math.random() * 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      <div className="container mx-auto px-6 relative z-10 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          <motion.h2
            className="text-4xl md:text-6xl font-display font-bold tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Chega de perder{" "}
            <motion.span 
              className="relative inline-block"
              whileInView={{ color: "var(--color-accent)" }}
              transition={{ delay: 0.8 }}
            >
              tempo
              <motion.div 
                className="absolute top-1/2 left-0 h-[2px] bg-accent"
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
              />
            </motion.span>{" "}
            e{" "}
            <motion.span 
              className="relative inline-block"
              whileInView={{ color: "var(--color-accent)" }}
              transition={{ delay: 0.8 }}
            >
              dinheiro
              <motion.div 
                className="absolute top-1/2 left-0 h-[2px] bg-accent"
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.5 }}
              />
            </motion.span>{" "}
            com bagunça.
          </motion.h2>
          
          <p className="text-xl text-muted-foreground/90 font-medium max-w-xl mx-auto">
            Junte-se a mais de <strong className="text-foreground"><Counter value={180} suffix="+" /> revendedores</strong> que profissionalizaram sua loja com a Rozz car. <br />
            <span className="text-accent text-sm uppercase tracking-wider font-bold mt-4 inline-block px-3 py-1 bg-accent/10 rounded-full border border-accent/20">Vagas de onboarding gratuito acabando.</span>
          </p>

          <div className="relative inline-block group w-full sm:w-auto px-4 sm:px-0">
            <PremiumButton href="/login?signup=1" size="lg" className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 h-16 px-12 text-xl font-bold shadow-[0_0_50px_rgba(var(--color-accent),0.3)] shimmer relative z-10">
              Garantir Meu Acesso Agora
              <ArrowRight className="ml-2 w-6 h-6 transition-transform group-hover:translate-x-1" />
            </PremiumButton>
            <div className="absolute -inset-4 border border-accent/20 rounded-full animate-ping opacity-20" />
            <div className="absolute -inset-8 border border-accent/10 rounded-full animate-ping opacity-10 [animation-delay:0.5s]" />
          </div>
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="py-12 border-t border-white/5">
    <div className="container mx-auto px-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent rounded flex items-center justify-center">
            <Car className="w-4 h-4 text-accent-foreground" />
          </div>
          <span className="font-display font-bold">Rozz car</span>
        </div>
        <div className="flex gap-8 text-sm text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Termos</a>
          <a href="#" className="hover:text-foreground transition-colors">Privacidade</a>
          <a href="#" className="hover:text-foreground transition-colors">Contato</a>
        </div>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Rozz car. Todos os direitos reservados.
        </p>
      </div>
    </div>
  </footer>
);

export default function Landing() {
  React.useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor && anchor.hash && anchor.origin === window.location.origin) {
        e.preventDefault();
        const element = document.querySelector(anchor.hash);
        if (element) {
          const offset = 80;
          const bodyRect = document.body.getBoundingClientRect().top;
          const elementRect = element.getBoundingClientRect().top;
          const elementPosition = elementRect - bodyRect;
          const offsetPosition = elementPosition - offset;

          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
          });
        }
      }
    };
    document.addEventListener("click", handleAnchorClick);
    return () => document.removeEventListener("click", handleAnchorClick);
  }, []);

  return (
    <div className="min-h-screen selection:bg-accent/30 selection:text-accent">
      <MouseFollower />
      <GridBackground />
      <Navbar />
      
      <main>
        <Hero />
        <PainPoints />
        <Solution />
        <Differentials />
        <SocialProof />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>

      <Footer />
    </div>
  );
}
