import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { hasRole, useAuth } from "@/lib/auth";
import type { UserRole } from "@/services/auth";

export function ProtectedRoute({
  children,
  allowRoles,
}: {
  children: React.ReactNode;
  allowRoles?: UserRole[];
}) {
  const { user, loading, tenant, isPlatformAdmin } = useAuth();
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

  return <>{children}</>;
}
