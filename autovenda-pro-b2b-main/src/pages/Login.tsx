import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Car, CheckCircle2, Eye, EyeOff, Loader2, Mail, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { getHomeRouteForRole } from "@/lib/navigation";
import { APP_BRAND_NAME, APP_BRAND_TAGLINE } from "@/lib/brand";
import { acceptInviteRequest, signupRequest } from "@/services/auth";

type View = "login" | "signup" | "forgot" | "reset" | "invite";

function slugifyStoreName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupStoreName, setSignupStoreName] = useState("");
  const [signupSlug, setSignupSlug] = useState("");
  const [signupOwnerName, setSignupOwnerName] = useState("");
  const [signupOwnerEmail, setSignupOwnerEmail] = useState("");
  const [signupOwnerPassword, setSignupOwnerPassword] = useState("");
  const [signupSlugDirty, setSignupSlugDirty] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<View>("login");
  const [forgotSent, setForgotSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, user } = useAuth();

  const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const redirectTo = requestedPath ?? getHomeRouteForRole(user?.role);
  const resetToken = searchParams.get("reset");
  const inviteToken = searchParams.get("invite");
  const inviteName = searchParams.get("name") ?? "";
  const inviteEmail = searchParams.get("email") ?? "";
  const inviteStore = searchParams.get("store") ?? "";
  const inviteRole = searchParams.get("role") ?? "";

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

  useEffect(() => {
    if (resetToken) setView("reset");
  }, [resetToken]);

  useEffect(() => {
    if (inviteToken) setView("invite");
  }, [inviteToken]);

  useEffect(() => {
    if (signupSlugDirty) return;
    setSignupSlug(slugifyStoreName(signupStoreName));
  }, [signupSlugDirty, signupStoreName]);

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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao solicitar recuperacao.");
      setForgotSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao solicitar recuperacao.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("As senhas nao coincidem.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter no minimo 6 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao redefinir senha.");
      setResetSuccess(true);
      setSearchParams({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao redefinir senha.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedSlug = slugifyStoreName(signupSlug || signupStoreName);
    if (!normalizedSlug) {
      toast.error("Informe um nome de loja valido para gerar o identificador.");
      return;
    }

    setSubmitting(true);
    try {
      const session = await signupRequest({
        storeName: signupStoreName,
        slug: normalizedSlug,
        ownerName: signupOwnerName,
        ownerEmail: signupOwnerEmail,
        ownerPassword: signupOwnerPassword,
      });
      toast.success("Loja criada com sucesso.");
      navigate(getHomeRouteForRole(session.user.role), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel criar a loja.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken) {
      toast.error("Convite invalido.");
      return;
    }
    if (invitePassword.length < 6) {
      toast.error("A senha deve ter no minimo 6 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const session = await acceptInviteRequest({
        token: inviteToken,
        password: invitePassword,
      });
      toast.success("Convite aceito com sucesso.");
      setSearchParams({});
      navigate(getHomeRouteForRole(session.user.role), { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel aceitar o convite.");
    } finally {
      setSubmitting(false);
    }
  };

  const goToLogin = () => {
    setView("login");
    setForgotSent(false);
    setResetSuccess(false);
    setNewPassword("");
    setConfirmPassword("");
    setInvitePassword("");
    setSearchParams({});
  };

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4">
      {/* Background */}
      <div className="absolute inset-0 bg-[hsl(225,22%,6%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-amber-600/8 blur-[120px]" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-orange-600/6 blur-[100px]" />
      <div className="absolute top-1/4 left-0 w-[300px] h-[300px] rounded-full bg-amber-500/5 blur-[80px]" />

      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="w-full max-w-md animate-fade-up relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 mb-4 shadow-2xl shadow-amber-500/30">
            <Car className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {APP_BRAND_NAME}
          </h1>
          <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
            {APP_BRAND_TAGLINE}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-white/[0.08] bg-[hsl(225,20%,10%)/0.9] backdrop-blur-xl shadow-2xl p-6 sm:p-8">

          {/* ── LOGIN ── */}
          {view === "login" && (
            <>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/60 text-xs font-semibold uppercase tracking-wider">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl pr-11 focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 font-bold text-sm rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.99]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Entrar
                </Button>
              </form>
              <div className="mt-6 pt-5 border-t border-white/[0.06]">
                <p className="text-center text-xs text-white/30">
                  Esqueceu sua senha?{" "}
                  <button type="button" onClick={() => setView("forgot")} className="text-amber-400/80 hover:text-amber-400 hover:underline font-medium transition-colors">
                    Recuperar acesso
                  </button>
                </p>
                <p className="mt-3 text-center text-xs text-white/30">
                  Quer entrar por conta propria?{" "}
                  <button type="button" onClick={() => setView("signup")} className="text-amber-400/80 hover:text-amber-400 hover:underline font-medium transition-colors">
                    Criar minha loja
                  </button>
                </p>
                <p className="mt-3 text-center text-[11px] leading-5 text-white/25">
                  Depois do cadastro, o owner entra no trial e monta a propria equipe por convite.
                </p>
              </div>
            </>
          )}

          {view === "signup" && (
            <>
              <button type="button" onClick={goToLogin} className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs font-medium mb-5 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
              </button>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
                  <Car className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Criar loja</h2>
                <p className="text-white/40 text-sm mt-1">Abra sua conta por conta propria, crie a revenda e entre direto no trial.</p>
              </div>
              <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-white/70">
                <div className="font-medium text-white">Fluxo recomendado</div>
                <div className="mt-1 text-white/45">
                  Voce cria a loja como owner agora e, depois de entrar, convida sua equipe para cada pessoa cadastrar a propria senha.
                </div>
              </div>
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-store-name" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Nome da loja</Label>
                  <Input
                    id="signup-store-name"
                    type="text"
                    placeholder="Ex.: Auto Prime Veiculos"
                    value={signupStoreName}
                    onChange={(e) => setSignupStoreName(e.target.value)}
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-slug" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Identificador da loja</Label>
                  <Input
                    id="signup-slug"
                    type="text"
                    placeholder="auto-prime-veiculos"
                    value={signupSlug}
                    onChange={(e) => {
                      setSignupSlugDirty(true);
                      setSignupSlug(slugifyStoreName(e.target.value));
                    }}
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                  />
                  <p className="text-[11px] text-white/30">Esse identificador precisa ser unico e sera usado internamente.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-owner-name" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Seu nome</Label>
                  <Input
                    id="signup-owner-name"
                    type="text"
                    placeholder="Nome do responsavel"
                    value={signupOwnerName}
                    onChange={(e) => setSignupOwnerName(e.target.value)}
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-owner-email" className="text-white/60 text-xs font-semibold uppercase tracking-wider">E-mail</Label>
                  <Input
                    id="signup-owner-email"
                    type="email"
                    placeholder="voce@loja.com"
                    value={signupOwnerEmail}
                    onChange={(e) => setSignupOwnerEmail(e.target.value)}
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-owner-password" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Senha</Label>
                  <Input
                    id="signup-owner-password"
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    value={signupOwnerPassword}
                    onChange={(e) => setSignupOwnerPassword(e.target.value)}
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 font-bold text-sm rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.99]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Criar loja e entrar
                </Button>
              </form>
            </>
          )}

          {view === "invite" && (
            <>
              <button type="button" onClick={goToLogin} className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs font-medium mb-5 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
              </button>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
                  <Shield className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Aceitar convite</h2>
                <p className="text-white/40 text-sm mt-1">
                  {inviteStore ? `Entre em ${inviteStore}` : "Crie sua senha para acessar a loja."}
                </p>
              </div>
              <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-white/70">
                <div><span className="text-white/40">Nome:</span> {inviteName || "Convite da loja"}</div>
                <div className="mt-1"><span className="text-white/40">E-mail:</span> {inviteEmail || "Seu acesso"}</div>
                <div className="mt-1"><span className="text-white/40">Perfil:</span> {inviteRole === "owner" ? "Acesso total" : "Vendedor"}</div>
              </div>
              <form onSubmit={handleAcceptInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-password" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Crie sua senha</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 font-bold text-sm rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.99]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Criar senha e entrar
                </Button>
              </form>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {view === "forgot" && !forgotSent && (
            <>
              <button type="button" onClick={goToLogin} className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs font-medium mb-5 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
              </button>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
                  <Mail className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Recuperar senha</h2>
                <p className="text-white/40 text-sm mt-1">Informe seu e-mail para receber o link de recuperacao.</p>
              </div>
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-white/60 text-xs font-semibold uppercase tracking-wider">E-mail</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 font-bold text-sm rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.99]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Enviar link
                </Button>
              </form>
            </>
          )}

          {/* ── FORGOT SENT SUCCESS ── */}
          {view === "forgot" && forgotSent && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-white">E-mail enviado!</h2>
              <p className="text-white/40 text-sm mt-2 leading-relaxed max-w-xs mx-auto">
                Se o e-mail estiver cadastrado, voce recebera um link para redefinir sua senha. Verifique sua caixa de entrada e spam.
              </p>
              <Button
                type="button"
                onClick={goToLogin}
                variant="outline"
                className="mt-6 border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                Voltar ao login
              </Button>
            </div>
          )}

          {/* ── RESET PASSWORD ── */}
          {view === "reset" && !resetSuccess && (
            <>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-3">
                  <Shield className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Nova senha</h2>
                <p className="text-white/40 text-sm mt-1">Crie uma nova senha para sua conta.</p>
              </div>
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new-password" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl pr-11 focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-white/60 text-xs font-semibold uppercase tracking-wider">Confirmar senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-amber-500/50 focus:ring-amber-500/20 transition-all"
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 font-bold text-sm rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.99]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Redefinir senha
                </Button>
              </form>
            </>
          )}

          {/* ── RESET SUCCESS ── */}
          {view === "reset" && resetSuccess && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Senha redefinida!</h2>
              <p className="text-white/40 text-sm mt-2 leading-relaxed">
                Sua senha foi alterada com sucesso. Faca login com a nova senha.
              </p>
              <Button
                type="button"
                onClick={goToLogin}
                className="mt-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold shadow-lg shadow-amber-500/25"
              >
                Fazer login
              </Button>
            </div>
          )}
        </div>

        {/* Features - only on login view */}
        {view === "login" && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-white/35 text-[11px] font-medium">Acesso seguro</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <Zap className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-white/35 text-[11px] font-medium">Tempo real</span>
            </div>
          </div>
        )}
        <div className="mt-4 text-center text-xs text-white/40">
          Ao continuar, voce concorda com a nossa{" "}
          <Link to="/privacidade" className="text-blue-300 hover:text-blue-200 underline underline-offset-2">
            Politica de Privacidade
          </Link>
          .
        </div>
      </div>
    </div>
  );
};

export default Login;
