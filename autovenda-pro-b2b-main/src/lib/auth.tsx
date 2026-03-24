import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AuthSession, UserRole } from "@/services/auth";
import { loginRequest, logoutRequest, validateSession } from "@/services/auth";

type AuthContextValue = {
  user: AuthSession["user"] | null;
  tenant: AuthSession["tenant"] | null;
  permissions: AuthSession["permissions"];
  loading: boolean;
  isPlatformAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
};

const EMPTY_PERMISSIONS = {
  canManagePlatform: false,
  canManageTeam: false,
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    try {
      const nextSession = await validateSession();
      setSession(nextSession);
      return nextSession;
    } catch {
      setSession(null);
      return null;
    }
  };

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = session?.user.role ?? null;
    return {
      user: session?.user ?? null,
      tenant: session?.tenant ?? null,
      permissions: session?.permissions ?? EMPTY_PERMISSIONS,
      loading,
      isPlatformAdmin: role === "platform_admin",
      async login(email: string, password: string) {
        const nextSession = await loginRequest(email, password);
        setSession(nextSession);
        return nextSession;
      },
      async logout() {
        setSession(null);
        try {
          await logoutRequest();
        } catch {
          // o cookie de sessao ja sera limpo no backend quando possivel
        }
      },
      refreshSession,
    };
  }, [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return context;
}

export function hasRole(role: UserRole | null, allowedRoles: UserRole[]) {
  if (!role) return false;
  return allowedRoles.includes(role);
}
