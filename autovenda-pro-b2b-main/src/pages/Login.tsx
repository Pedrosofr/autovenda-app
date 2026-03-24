import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Car, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { getHomeRouteForRole } from "@/lib/navigation";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, user } = useAuth();

  const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const redirectTo = requestedPath ?? getHomeRouteForRole(user?.role);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const session = await login(email, password);
      toast.success("Acesso liberado.");
      navigate(requestedPath ?? getHomeRouteForRole(session.user.role), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel entrar.");
    } finally {
      setSubmitting(false);
    }
  };

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_38%),hsl(230,20%,7%)] p-4">
      <div className="w-full max-w-md animate-fade-up">
        <div className="rounded-3xl border border-white/10 bg-[hsl(230,18%,11%)] shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl card-gradient-blue mb-2 shadow-lg shadow-blue-500/20">
              <Car className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">AutoCRM Pro</h1>
            <p className="text-white/45 text-sm leading-relaxed">
              Centralize estoque, gere anuncios com agilidade e acompanhe suas oportunidades em um so lugar.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="bg-white/5 border-white/10 text-white"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-white/5 border-white/10 text-white"
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full h-11 font-semibold card-gradient-blue text-white">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Entrar
            </Button>
          </form>

          <p className="text-center text-xs text-white/35">
            Esqueceu sua senha?{" "}
            <button type="button" className="text-blue-400 hover:underline font-medium">
              Recuperar acesso
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
