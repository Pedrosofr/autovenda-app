import { startTransition, useEffect, useState } from "react";
import { Crown, Loader2, Target, UserPlus, Users2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { createSeller, fetchTeamMembers, type TeamMember } from "@/services/team";

const INITIAL_FORM = {
  name: "",
  email: "",
  password: "",
  salesGoalMonthly: "",
  role: "seller" as "owner" | "seller",
};

export default function TeamManagement() {
  const { tenant } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    let active = true;

    fetchTeamMembers()
      .then(({ members: nextMembers }) => {
        if (!active) return;
        startTransition(() => setMembers(nextMembers));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar a equipe.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCreateSeller = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await createSeller({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        salesGoalMonthly: form.salesGoalMonthly ? Number(form.salesGoalMonthly) : null,
      });

      startTransition(() => setMembers(response.members));
      setForm(INITIAL_FORM);
      toast.success("Usuario criado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel criar o usuario.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300/80">Equipe</div>
        <h1 className="text-3xl font-bold tracking-tight">Owner e vendedores da loja</h1>
        <p className="max-w-3xl text-sm leading-6 text-white/55">
          {tenant?.name ?? "Sua loja"} fica com acessos separados, metas mensais e historico unico por conta.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/45">Usuarios ativos</CardDescription>
            <CardTitle className="text-3xl">{members.filter((member) => member.ativo === 1).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/45">Vendedores</CardDescription>
            <CardTitle className="text-3xl">{members.filter((member) => member.papel === "seller").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/45">Meta total do time</CardDescription>
            <CardTitle className="text-3xl">
              {members.reduce((total, member) => total + (member.meta_mensal ?? 0), 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,1.55fr]">
        <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(31,41,55,0.85),rgba(15,23,42,0.92))] text-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Novo usuario da loja</CardTitle>
            <CardDescription className="text-white/45">
              Crie acessos com perfil administrativo ou somente operacional, sem compartilhar a senha principal da loja.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateSeller}>
              <div className="space-y-2">
                <Label htmlFor="sellerName" className="text-white/70">Nome</Label>
                <Input
                  id="sellerName"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="border-white/10 bg-black/20 text-white"
                  placeholder="Ex.: Julia Vendas"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellerEmail" className="text-white/70">E-mail</Label>
                <Input
                  id="sellerEmail"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="border-white/10 bg-black/20 text-white"
                  placeholder="vendedor@loja.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellerPassword" className="text-white/70">Senha inicial</Label>
                <Input
                  id="sellerPassword"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="border-white/10 bg-black/20 text-white"
                  placeholder="Crie uma senha"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sellerGoal" className="text-white/70">Meta mensal</Label>
                <Input
                  id="sellerGoal"
                  type="number"
                  min="0"
                  value={form.salesGoalMonthly}
                  onChange={(event) => setForm((current) => ({ ...current, salesGoalMonthly: event.target.value }))}
                  className="border-white/10 bg-black/20 text-white"
                  placeholder="Ex.: 6"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Perfil de acesso</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      form.role === "owner"
                        ? "border-blue-500/30 bg-blue-500/10 text-white"
                        : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.05]"
                    }`}
                    onClick={() => setForm((current) => ({ ...current, role: "owner" }))}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <Crown className="h-4 w-4 text-blue-300" />
                      Acesso total
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Pode gerenciar equipe e configuracoes da loja.
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      form.role === "seller"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-white"
                        : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.05]"
                    }`}
                    onClick={() => setForm((current) => ({ ...current, role: "seller" }))}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <Users2 className="h-4 w-4 text-emerald-300" />
                      Somente vendedor
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Usa CRM e operacao diaria sem area administrativa.
                    </div>
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="w-full card-gradient-blue text-white">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Criar usuario
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Acessos da loja</CardTitle>
            <CardDescription className="text-white/45">
              O owner controla a equipe, e cada vendedor trabalha com o proprio login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-white/65">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando equipe...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/45">Pessoa</TableHead>
                    <TableHead className="text-white/45">Papel</TableHead>
                    <TableHead className="text-white/45">Meta</TableHead>
                    <TableHead className="text-white/45">Status</TableHead>
                    <TableHead className="text-white/45">Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id} className="border-white/10 hover:bg-white/[0.03]">
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                            <Users2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-white">{member.nome}</div>
                            <div className="text-xs text-white/45">{member.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            member.papel === "owner"
                              ? "border-blue-500/20 bg-blue-500/10 text-blue-300"
                              : "border-white/10 bg-white/5 text-white/70"
                          }
                        >
                          {member.papel === "owner" ? "Acesso total" : "Somente vendedor"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-white/75">
                          <Target className="h-3.5 w-3.5 text-blue-300" />
                          {member.meta_mensal ?? 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            member.ativo
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                              : "border-red-500/20 bg-red-500/10 text-red-300"
                          }
                        >
                          {member.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white/65">
                        {new Date(member.criado_em).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
