import { Navigate, useLocation } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { hasRole, useAuth } from "@/lib/auth";
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
  const { user, loading, tenant, isPlatformAdmin, permissions } = useAuth();
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

  if (allowRoles && !hasRole(user.role, allowRoles)) {
    return <Navigate to={isPlatformAdmin ? "/platform" : "/dashboard"} replace />;
  }

  if (!isPlatformAdmin && (tenant?.status === "blocked" || tenant?.status === "closed")) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission && user.role === "seller" && !permissions.sellerPermissions[requiredPermission]) {
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
