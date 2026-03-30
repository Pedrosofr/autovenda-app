import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppStoreProvider } from "@/store/appStore";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import DevUsagePanel from "@/components/DevUsagePanel";

const queryClient = new QueryClient();
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CRMKanban = lazy(() => import("./pages/CRMKanban"));
const Estoque = lazy(() => import("./pages/Estoque"));
const Vendas = lazy(() => import("./pages/Vendas"));
const ConsultaVeicular = lazy(() => import("./pages/ConsultaVeicular"));
const PosVenda = lazy(() => import("./pages/PosVenda"));
const Custos = lazy(() => import("./pages/Custos"));
const Creditos = lazy(() => import("./pages/Creditos"));
const PlatformConsole = lazy(() => import("./pages/PlatformConsole"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const NFeConfig = lazy(() => import("./pages/NFeConfig"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen bg-[hsl(230,20%,7%)] text-white flex items-center justify-center px-6">
    <div className="text-center">
      <div className="text-sm uppercase tracking-[0.3em] text-amber-400/80">Rozzcar</div>
      <div className="mt-3 text-lg font-semibold">Carregando modulo...</div>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AppStoreProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <DevUsagePanel />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/platform" element={<ProtectedRoute allowRoles={["platform_admin"]}><AppLayout><PlatformConsole /></AppLayout></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute allowRoles={["owner", "seller"]}><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
                <Route path="/crm" element={<ProtectedRoute allowRoles={["owner", "seller"]} requiredPermission="verCRM"><AppLayout><CRMKanban /></AppLayout></ProtectedRoute>} />
                <Route path="/estoque" element={<ProtectedRoute allowRoles={["owner", "seller"]} requiredPermission="verEstoque"><AppLayout><Estoque /></AppLayout></ProtectedRoute>} />
                <Route path="/vendas" element={<ProtectedRoute allowRoles={["owner", "seller"]} requiredPermission="verEstoque"><AppLayout><Vendas /></AppLayout></ProtectedRoute>} />
                <Route path="/consulta" element={<ProtectedRoute allowRoles={["owner", "seller"]} requiredPermission="verConsulta"><AppLayout><ConsultaVeicular /></AppLayout></ProtectedRoute>} />
                <Route path="/pos-venda" element={<ProtectedRoute allowRoles={["owner", "seller"]} requiredPermission="verPosVenda"><AppLayout><PosVenda /></AppLayout></ProtectedRoute>} />
                <Route path="/custos" element={<ProtectedRoute allowRoles={["owner", "seller"]} requiredPermission="verCustos"><AppLayout><Custos /></AppLayout></ProtectedRoute>} />
                <Route path="/creditos" element={<ProtectedRoute allowRoles={["owner", "seller"]} requiredPermission="verCreditos"><AppLayout><Creditos /></AppLayout></ProtectedRoute>} />
                <Route path="/equipe" element={<ProtectedRoute allowRoles={["owner"]}><AppLayout><TeamManagement /></AppLayout></ProtectedRoute>} />
                <Route path="/nfe" element={<ProtectedRoute allowRoles={["owner"]}><AppLayout><NFeConfig /></AppLayout></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AppStoreProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
