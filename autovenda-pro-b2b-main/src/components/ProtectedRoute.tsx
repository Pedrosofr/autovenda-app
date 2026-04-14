import { Navigate, useLocation } from "react-router-dom";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import type { UserRole, SellerPermissions } from "@/services/auth";

export function ProtectedRoute({
  children,
  allowRoles,
  requiredPermission,
}: {
  children: React.ReactNode;
  allowRoles?: UserRole[];
  requiredPermission?: keyof SellerPermissions;
}) {
  const { user, loading, tenant, isPlatformAdmin } = useAuth();
  const { hasAllowedRole, hasSellerPermission } = usePermissions();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(230,20%,7%)]">
        <div className="flex items-center gap-3 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" />
          Validando sessao...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (!hasAllowedRole(allowRoles)) {
    return <Navigate to={isPlatformAdmin ? "/platform" : "/dashboard"} replace />;
  }

  if (!isPlatformAdmin && (tenant?.status === "past_due" || tenant?.status === "blocked" || tenant?.status === "closed")) {
    if (tenant?.status === "past_due") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[hsl(230,20%,7%)] px-6">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/20 bg-[hsl(230,18%,11%)] p-6 text-center text-white shadow-2xl shadow-black/30">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold">Trial expirado</h1>
            <p className="mt-2 text-sm leading-6 text-white/55">
              O periodo de teste da sua loja terminou. Fale com o suporte ou com o responsavel pela conta para regularizar o acesso.
            </p>
          </div>
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }

  if (!hasSellerPermission(requiredPermission)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-white/50">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
          <Lock className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-white/70">Acesso restrito</p>
          <p className="text-sm mt-1">O owner desta loja nao habilitou este modulo para sua conta.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
