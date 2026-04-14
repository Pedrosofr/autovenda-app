import { hasRole, useAuth } from "@/lib/auth";
import type { SellerPermissions, UserRole } from "@/services/auth";

export function usePermissions() {
  const { user, permissions, isPlatformAdmin } = useAuth();

  const hasAllowedRole = (allowRoles?: UserRole[]) => {
    if (!allowRoles || allowRoles.length === 0) return true;
    return hasRole(user?.role ?? null, allowRoles);
  };

  const hasSellerPermission = (permission?: keyof SellerPermissions) => {
    if (!permission) return true;
    if (!user || user.role !== "seller") return true;
    return permissions.sellerPermissions[permission];
  };

  return {
    hasAllowedRole,
    hasSellerPermission,
    isPlatformAdmin,
    isSeller: user?.role === "seller",
  };
}
