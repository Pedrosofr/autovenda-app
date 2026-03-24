import type { UserRole } from "@/services/auth";

export function getHomeRouteForRole(role: UserRole | null | undefined) {
  return role === "platform_admin" ? "/platform" : "/dashboard";
}
