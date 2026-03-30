import { startTransition, useEffect, useMemo, useState } from "react";
import { Building2, Crown, Loader2, LogIn, Plus, ShieldCheck, UserPlus, Users2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchPlatformActivity, type AuditEvent } from "@/services/activity";
import { logoutRequest } from "@/services/auth";
import {
  createPlatformStore,
  createPlatformStoreUser,
  fetchPlatformStores,
  fetchPlatformStoreUsers,
  type PlatformStoreMember,
  type PlatformStoreSummary,
  updatePlatformStore,
} from "@/services/platform";

const INITIAL_STORE_FORM = {
  storeName: "",
  slug: "",
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "",
  trialDays: "7",
  maxUsers: "5",
};

const INITIAL_USER_FORM = {
  name: "",
  email: "",
  password: "",
  salesGoalMonthly: "",
  role: "seller" as "owner" | "seller",
};

function statusLabel(status: PlatformStoreSummary["status"]) {
  switch (status) {
    case "trial":
      return "trial";
    case "active":
      return "ativa";
    case "past_due":
      return "pendente";
    case "blocked":
      return "bloqueada";
    case "closed":
      return "encerrada";
    default:
      return status;
  }
}

function statusClassName(status: PlatformStoreSummary["status"]) {
  switch (status) {
    case "trial":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "active":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300";
    case "past_due":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "blocked":
    case "closed":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function memberRoleLabel(role: PlatformStoreMember["papel"]) {
  return role === "owner" ? "Acesso total" : "Somente vendedor";
}

function formatTrialDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function sanitizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function activityLabel(action: string) {
  switch (action) {
    case "tenant.created":
      return "Loja criada";
    case "tenant.updated":
      return "Configuracao da loja atualizada";
    case "tenant.user.created":
      return "Usuario da loja criado";
    case "auth.login":
      return "Login realizado";
    case "tenant.state.updated":
      return "Dados da loja sincronizados";
    default:
      return action;
  }
}

export default function PlatformConsole() {
  const [stores, setStores] = useState<PlatformStoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingStore, setSubmittingStore] = useState(false);
  const [updatingStoreId, setUpdatingStoreId] = useState<number | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<PlatformStoreSummary | null>(null);
  const [members, setMembers] = useState<PlatformStoreMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [storeForm, setStoreForm] = useState(INITIAL_STORE_FORM);
  const [manageSettings, setManageSettings] = useState({ trialDays: "7", maxUsers: "5" });
  const [userForm, setUserForm] = useState(INITIAL_USER_FORM);

  useEffect(() => {
    let active = true;

    fetchPlatformStores()
      .then(({ stores: nextStores }) => {
        if (!active) return;
        startTransition(() => setStores(nextStores));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar as lojas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchPlatformActivity()
      .then(({ events }) => {
        if (!active) return;
        startTransition(() => setActivity(events));
      })
      .catch(() => {
        if (!active) return;
        startTransition(() => setActivity([]));
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(
    () => ({
      stores: stores.length,
      trial: stores.filter((store) => store.status === "trial").length,
      active: stores.filter((store) => store.status === "active").length,
    }),
    [stores],
  );

  const refreshActivity = async () => {
    try {
      const { events } = await fetchPlatformActivity();
      startTransition(() => setActivity(events));
    } catch {
      // sem bloquear a UI principal
    }
  };

  const handleStoreField = (field: keyof typeof storeForm, value: string) => {
    setStoreForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "storeName") {
        next.slug = sanitizeSlug(value);
      }
      return next;
    });
  };

  const handleCreateStore = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittingStore(true);

    try {
      const response = await createPlatformStore({
        storeName: storeForm.storeName.trim(),
        slug: sanitizeSlug(storeForm.slug),
        ownerName: storeForm.ownerName.trim(),
        ownerEmail: storeForm.ownerEmail.trim().toLowerCase(),
        ownerPassword: storeForm.ownerPassword,
        trialDays: Number(storeForm.trialDays || "7"),
        maxUsers: Number(storeForm.maxUsers || "5"),
      });

      startTransition(() => setStores(response.stores));
      setStoreForm(INITIAL_STORE_FORM);
      void refreshActivity();
      toast.success("Loja criada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel criar a loja.");
    } finally {
      setSubmittingStore(false);
    }
  };

  const openStoreManagement = async (store: PlatformStoreSummary) => {
    setSelectedStore(store);
    setManageSettings({
      trialDays: "7",
      maxUsers: String(store.max_users),
    });
    setUserForm(INITIAL_USER_FORM);
    setMembers([]);
    setManageOpen(true);
    setMembersLoading(true);

    try {
      const response = await fetchPlatformStoreUsers(store.id);
      startTransition(() => setMembers(response.members));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar os usuarios da loja.");
    } finally {
      setMembersLoading(false);
    }
  };

  const handleQuickStatusUpdate = async (
    storeId: number,
    payload: Parameters<typeof updatePlatformStore>[1],
    successMessage: string,
  ) => {
    setUpdatingStoreId(storeId);
    try {
      const response = await updatePlatformStore(storeId, payload);
      startTransition(() => {
        setStores(response.stores);
        setSelectedStore((current) => response.stores.find((store) => store.id === current?.id) ?? current);
      });
      void refreshActivity();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar a loja.");
    } finally {
      setUpdatingStoreId(null);
    }
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStore) return;

    setSavingSettings(true);
    try {
      const response = await updatePlatformStore(selectedStore.id, {
        trialDays: Number(manageSettings.trialDays || "7"),
        maxUsers: Number(manageSettings.maxUsers || String(selectedStore.max_users)),
      });

      const nextSelectedStore = response.stores.find((store) => store.id === selectedStore.id) ?? selectedStore;
      startTransition(() => {
        setStores(response.stores);
        setSelectedStore(nextSelectedStore);
        setManageSettings((current) => ({
          ...current,
          maxUsers: String(nextSelectedStore.max_users),
        }));
      });
      void refreshActivity();
      toast.success("Configuracoes da loja atualizadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar as configuracoes.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStore) return;

    setCreatingUser(true);
    try {
      const response = await createPlatformStoreUser(selectedStore.id, {
        name: userForm.name.trim(),
        email: userForm.email.trim().toLowerCase(),
        password: userForm.password,
        role: userForm.role,
        salesGoalMonthly: userForm.salesGoalMonthly ? Number(userForm.salesGoalMonthly) : null,
      });

      const refreshedStores = await fetchPlatformStores();
      const nextSelectedStore = refreshedStores.stores.find((store) => store.id === selectedStore.id) ?? selectedStore;

      startTransition(() => {
        setMembers(response.members);
        setStores(refreshedStores.stores);
        setSelectedStore(nextSelectedStore);
      });
      void refreshActivity();
      setUserForm(INITIAL_USER_FORM);
      toast.success("Usuario criado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel criar o usuario.");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleGoToStoreLogin = async (store: PlatformStoreSummary) => {
    if (!store.owner_email) {
      toast.error("Essa loja ainda nao tem e-mail de owner configurado.");
      return;
    }

    await logoutRequest().catch(() => undefined);
    window.location.assign(`/?email=${encodeURIComponent(store.owner_email)}`);
    toast.success("Sessao da plataforma encerrada. Entre agora com a senha da loja.");
  };

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300/80">SaaS Control</div>
        <h1 className="text-3xl font-bold tracking-tight">Lojas, owners e trial em um painel unico</h1>
        <p className="max-w-3xl text-sm leading-6 text-white/55">
          Cada loja nasce isolada, com owner proprio, periodo de trial configuravel e limite de usuarios sem misturar dados.
        </p>
        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              const firstStoreWithOwner = stores.find((store) => store.owner_email);
              if (!firstStoreWithOwner) {
                toast.error("Nenhuma loja com owner pronta para login.");
                return;
              }
              void handleGoToStoreLogin(firstStoreWithOwner);
            }}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Ir para login da loja
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/45">Lojas cadastradas</CardDescription>
            <CardTitle className="text-3xl">{stats.stores}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/45">Em trial</CardDescription>
            <CardTitle className="text-3xl">{stats.trial}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/45">Ativas</CardDescription>
            <CardTitle className="text-3xl">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
        <CardHeader>
          <CardTitle className="text-xl">Movimentacoes recentes</CardTitle>
          <CardDescription className="text-white/45">
            Trilhas de login, criacao de loja, usuarios e atualizacoes principais da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-white/65">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando movimentacoes...
            </div>
          ) : activity.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/55">
              Nenhuma movimentacao registrada ainda.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activity.slice(0, 6).map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{activityLabel(event.action)}</p>
                    <span className="text-[11px] text-white/40">
                      {new Date(event.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-white/55">
                    {event.tenantName ?? "Plataforma"}{event.actorName ? ` • ${event.actorName}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,1.45fr]">
        <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(31,41,55,0.85),rgba(15,23,42,0.92))] text-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Nova loja</CardTitle>
            <CardDescription className="text-white/45">
              Crie a loja, o owner principal, os dias de trial e o limite inicial de usuarios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateStore}>
              <div className="space-y-2">
                <Label htmlFor="storeName" className="text-white/70">Nome da loja</Label>
                <Input
                  id="storeName"
                  value={storeForm.storeName}
                  onChange={(event) => handleStoreField("storeName", event.target.value)}
                  className="border-white/10 bg-black/20 text-white"
                  placeholder="Ex.: Auto Serra"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storeSlug" className="text-white/70">Identificador</Label>
                <Input
                  id="storeSlug"
                  value={storeForm.slug}
                  onChange={(event) => handleStoreField("slug", event.target.value)}
                  className="border-white/10 bg-black/20 text-white"
                  placeholder="auto-serra"
                  required
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ownerName" className="text-white/70">Owner</Label>
                  <Input
                    id="ownerName"
                    value={storeForm.ownerName}
                    onChange={(event) => handleStoreField("ownerName", event.target.value)}
                    className="border-white/10 bg-black/20 text-white"
                    placeholder="Nome do dono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trialDays" className="text-white/70">Trial inicial (dias)</Label>
                  <Input
                    id="trialDays"
                    type="number"
                    min="1"
                    value={storeForm.trialDays}
                    onChange={(event) => handleStoreField("trialDays", event.target.value)}
                    className="border-white/10 bg-black/20 text-white"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail" className="text-white/70">E-mail do owner</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={storeForm.ownerEmail}
                  onChange={(event) => handleStoreField("ownerEmail", event.target.value)}
                  className="border-white/10 bg-black/20 text-white"
                  placeholder="owner@loja.com"
                  required
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ownerPassword" className="text-white/70">Senha inicial</Label>
                  <Input
                    id="ownerPassword"
                    type="password"
                    value={storeForm.ownerPassword}
                    onChange={(event) => handleStoreField("ownerPassword", event.target.value)}
                    className="border-white/10 bg-black/20 text-white"
                    placeholder="Crie uma senha"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxUsers" className="text-white/70">Limite inicial de usuarios</Label>
                  <Input
                    id="maxUsers"
                    type="number"
                    min="1"
                    value={storeForm.maxUsers}
                    onChange={(event) => handleStoreField("maxUsers", event.target.value)}
                    className="border-white/10 bg-black/20 text-white"
                    required
                  />
                </div>
              </div>

              <Button type="submit" disabled={submittingStore} className="w-full card-gradient-blue text-white">
                {submittingStore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Criar loja
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Base de lojas</CardTitle>
            <CardDescription className="text-white/45">
              Controle trial, status, limite de usuarios e os acessos de cada loja sem misturar operacoes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-white/65">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando lojas...
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/45">Loja</TableHead>
                    <TableHead className="text-white/45">Owner</TableHead>
                    <TableHead className="text-white/45">Status</TableHead>
                    <TableHead className="text-white/45">Usuarios</TableHead>
                    <TableHead className="text-white/45">Trial</TableHead>
                    <TableHead className="text-right text-white/45">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => (
                    <TableRow key={store.id} className="border-white/10 hover:bg-white/[0.03]">
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-white">{store.name}</div>
                            <div className="text-xs lowercase text-white/45">{store.slug}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-white">{store.owner_name ?? "Sem owner"}</div>
                        <div className="text-xs text-white/45">{store.owner_email ?? "Sem e-mail"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClassName(store.status)}>
                          {statusLabel(store.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white/75">{store.users_count}/{store.max_users}</TableCell>
                      <TableCell className="text-white/65">{formatTrialDate(store.trial_ends_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                            onClick={() => openStoreManagement(store)}
                          >
                            Gerenciar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-blue-500/20 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
                            onClick={() => {
                              void handleGoToStoreLogin(store);
                            }}
                          >
                            Login
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                            disabled={updatingStoreId === store.id}
                            onClick={() => handleQuickStatusUpdate(store.id, { extendTrialDays: 7 }, "Trial estendido em 7 dias.")}
                          >
                            {updatingStoreId === store.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            +7d
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            disabled={updatingStoreId === store.id}
                            onClick={() => handleQuickStatusUpdate(store.id, { status: "active" }, "Loja ativada.")}
                          >
                            Ativar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                            disabled={updatingStoreId === store.id}
                            onClick={() => handleQuickStatusUpdate(store.id, { status: "blocked" }, "Loja bloqueada.")}
                          >
                            Bloquear
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={store.nfe_enabled ? "border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"}
                            disabled={updatingStoreId === store.id}
                            onClick={() => handleQuickStatusUpdate(store.id, { nfeEnabled: !store.nfe_enabled }, store.nfe_enabled ? "NF-e desativado." : "NF-e ativado.")}
                          >
                            NF-e {store.nfe_enabled ? "ON" : "OFF"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[90dvh] overflow-y-auto border-white/10 bg-[hsl(230,20%,9%)] text-white">
          <DialogHeader>
            <DialogTitle>Gerenciar loja</DialogTitle>
            <DialogDescription className="text-white/45">
              {selectedStore ? `${selectedStore.name} (${selectedStore.users_count}/${selectedStore.max_users} usuarios)` : "Controle trial e acessos."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-[0.95fr,1.25fr]">
            <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Configuracoes da loja</CardTitle>
                <CardDescription className="text-white/45">
                  Ao salvar, os dias de trial passam a contar novamente a partir de hoje.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSaveSettings}>
                  <div className="space-y-2">
                    <Label htmlFor="manageTrialDays" className="text-white/70">Dias de trial</Label>
                    <Input
                      id="manageTrialDays"
                      type="number"
                      min="1"
                      value={manageSettings.trialDays}
                      onChange={(event) => setManageSettings((current) => ({ ...current, trialDays: event.target.value }))}
                      className="border-white/10 bg-black/20 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manageMaxUsers" className="text-white/70">Limite de usuarios</Label>
                    <Input
                      id="manageMaxUsers"
                      type="number"
                      min={Math.max(1, members.length)}
                      value={manageSettings.maxUsers}
                      onChange={(event) => setManageSettings((current) => ({ ...current, maxUsers: event.target.value }))}
                      className="border-white/10 bg-black/20 text-white"
                    />
                  </div>
                  <DialogFooter className="justify-start sm:justify-start">
                    <Button type="submit" disabled={savingSettings} className="card-gradient-blue text-white">
                      {savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Salvar configuracoes
                    </Button>
                  </DialogFooter>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(31,41,55,0.85),rgba(15,23,42,0.92))] text-white shadow-none">
                <CardHeader>
                  <CardTitle className="text-lg">Novo usuario da loja</CardTitle>
                  <CardDescription className="text-white/45">
                    Crie acessos com permissao total da loja ou somente perfil operacional de vendedor.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleCreateUser}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="memberName" className="text-white/70">Nome</Label>
                        <Input
                          id="memberName"
                          value={userForm.name}
                          onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
                          className="border-white/10 bg-black/20 text-white"
                          placeholder="Nome do usuario"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="memberEmail" className="text-white/70">E-mail</Label>
                        <Input
                          id="memberEmail"
                          type="email"
                          value={userForm.email}
                          onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                          className="border-white/10 bg-black/20 text-white"
                          placeholder="usuario@loja.com"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="memberPassword" className="text-white/70">Senha inicial</Label>
                        <Input
                          id="memberPassword"
                          type="password"
                          value={userForm.password}
                          onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                          className="border-white/10 bg-black/20 text-white"
                          placeholder="Crie uma senha"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="memberGoal" className="text-white/70">Meta mensal</Label>
                        <Input
                          id="memberGoal"
                          type="number"
                          min="0"
                          value={userForm.salesGoalMonthly}
                          onChange={(event) => setUserForm((current) => ({ ...current, salesGoalMonthly: event.target.value }))}
                          className="border-white/10 bg-black/20 text-white"
                          placeholder="Ex.: 6"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white/70">Perfil de acesso</Label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <button
                          type="button"
                          className={`rounded-2xl border px-4 py-3 text-left transition ${
                            userForm.role === "owner"
                              ? "border-blue-500/30 bg-blue-500/10 text-white"
                              : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.05]"
                          }`}
                          onClick={() => setUserForm((current) => ({ ...current, role: "owner" }))}
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            <Crown className="h-4 w-4 text-blue-300" />
                            Acesso total
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            Pode gerenciar equipe, loja, metas e toda a operacao.
                          </div>
                        </button>
                        <button
                          type="button"
                          className={`rounded-2xl border px-4 py-3 text-left transition ${
                            userForm.role === "seller"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-white"
                              : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.05]"
                          }`}
                          onClick={() => setUserForm((current) => ({ ...current, role: "seller" }))}
                        >
                          <div className="flex items-center gap-2 font-semibold">
                            <Users2 className="h-4 w-4 text-emerald-300" />
                            Somente vendedor
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            Usa o CRM e a operacao diaria sem acessar o controle da loja.
                          </div>
                        </button>
                      </div>
                    </div>

                    <Button type="submit" disabled={creatingUser} className="card-gradient-blue text-white">
                      {creatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                      Criar usuario
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
                <CardHeader>
                  <CardTitle className="text-lg">Usuarios da loja</CardTitle>
                  <CardDescription className="text-white/45">
                    {selectedStore ? `${members.length}/${selectedStore.max_users} ocupados no limite atual.` : "Acompanhe os acessos."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {membersLoading ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-white/65">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando usuarios...
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-white/45">Pessoa</TableHead>
                          <TableHead className="text-white/45">Perfil</TableHead>
                          <TableHead className="text-white/45">Meta</TableHead>
                          <TableHead className="text-white/45">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.id} className="border-white/10 hover:bg-white/[0.03]">
                            <TableCell>
                              <div className="font-semibold text-white">{member.nome}</div>
                              <div className="text-xs text-white/45">{member.email}</div>
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
                                {memberRoleLabel(member.papel)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-white/70">{member.meta_mensal ?? 0}</TableCell>
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
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
