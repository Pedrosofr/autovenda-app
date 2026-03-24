import {
  Building2,
  Car,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";

const APP_NAV_ITEMS = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "CRM Leads", url: "/crm", icon: Users },
  { title: "Estoque", url: "/estoque", icon: Car },
  { title: "Consulta Veicular", url: "/consulta", icon: Search },
  { title: "P\u00f3s-Venda", url: "/pos-venda", icon: HeartHandshake },
  { title: "Custos", url: "/custos", icon: Wrench },
];

const PLATFORM_NAV_ITEMS = [{ title: "Lojas", url: "/platform", icon: Building2 }];

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "trial":
      return "Trial";
    case "active":
      return "Ativa";
    case "past_due":
      return "Pendente";
    case "blocked":
      return "Bloqueada";
    case "closed":
      return "Encerrada";
    default:
      return "Sem loja";
  }
}

function statusClassName(status: string | null | undefined) {
  switch (status) {
    case "trial":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "active":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300";
    case "past_due":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "blocked":
    case "closed":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const { logout, isPlatformAdmin, permissions, tenant, user } = useAuth();

  const navItems = isPlatformAdmin ? PLATFORM_NAV_ITEMS : APP_NAV_ITEMS;

  const profileLabel = isPlatformAdmin ? "Admin da plataforma" : tenant?.name ?? user?.name ?? "Equipe";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="pt-6">
        <div className="px-5 pb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl card-gradient-blue flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <span className="font-extrabold text-white text-lg tracking-tight block leading-tight">
                AutoCRM
              </span>
              <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-[0.2em]">
                {isPlatformAdmin ? "Platform" : "Pro 2026"}
              </span>
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="mx-5 mb-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">Sessao</div>
            <div className="mt-2 text-sm font-semibold text-white">{profileLabel}</div>
            <div className="mt-1 text-xs text-white/45">{user?.email}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className={statusClassName(tenant?.status)}>
                {statusLabel(tenant?.status)}
              </Badge>
              {tenant?.daysRemaining !== null && tenant?.daysRemaining !== undefined ? (
                <Badge variant="outline" className="border-blue-500/20 bg-blue-500/10 text-blue-300">
                  {tenant.daysRemaining} dias restantes
                </Badge>
              ) : null}
            </div>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard" || item.url === "/platform"}
                      className="hover:bg-white/5 text-[hsl(225,10%,48%)] hover:text-white transition-all duration-200 rounded-xl mx-3 px-3 py-2.5"
                      activeClassName="bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20 shadow-[0_0_20px_hsl(217,91%,60%,0.1)]"
                    >
                      <item.icon className="mr-3 h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="text-[13px]">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-auto p-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink
                  to="/"
                  onClick={async (event) => {
                    event.preventDefault();
                    await logout();
                    navigate("/", { replace: true });
                  }}
                  className="hover:bg-red-500/10 text-[hsl(225,10%,40%)] hover:text-red-400 transition-all duration-200 rounded-xl mx-3 px-3 py-2.5"
                  activeClassName=""
                >
                  <LogOut className="mr-3 h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="text-[13px]">Sair</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user, tenant, isPlatformAdmin, logout } = useAuth();
  const title = isPlatformAdmin ? "Console da plataforma" : tenant?.name ?? "AutoCRM";
  const subtitle = isPlatformAdmin
    ? "Controle lojas, trials e acessos em um lugar."
    : user?.name
      ? `Conectado como ${user.name}`
      : "Operacao conectada";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-[hsl(230,20%,7%)]">
        <SidebarNav />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 sm:h-16 flex items-center border-b border-white/5 bg-[hsl(230,20%,7%,0.8)] backdrop-blur-xl px-3 sm:px-5 shrink-0 sticky top-0 z-40">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <SidebarTrigger>
                <Menu className="h-5 w-5 text-white/40 hover:text-white transition-colors" />
              </SidebarTrigger>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{title}</div>
                <div className="hidden truncate text-xs text-white/40 sm:block">{subtitle}</div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 bg-white/5 px-2.5 text-white/75 hover:bg-white/10 sm:px-3"
              onClick={async () => {
                await logout();
                navigate("/", { replace: true });
              }}
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </header>
          <main className="flex-1 overflow-auto p-3 sm:p-5 md:p-7">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
