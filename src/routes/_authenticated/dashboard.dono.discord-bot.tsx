import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot, Loader2, AlertCircle, RefreshCw, Save, Send, ShieldCheck, ShieldX,
  Search, Inbox, CheckCircle2, XCircle, Download, PlugZap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getBotStatus, saveBotSettings, saveRoleMap, saveBotMessages,
  assignDiscordRole, removeDiscordRole, sendDiscordDm, syncDiscordUser,
  testBotConnection,
} from "@/lib/discordBot.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard/dono/discord-bot")({
  component: DiscordBotPanel,
});

const MESSAGE_KEYS = [
  { key: "welcome", label: "Boas-vindas (formulário aprovado)" },
  { key: "payment_pending", label: "Pagamento pendente" },
  { key: "payment_overdue", label: "Pagamento atrasado" },
  { key: "role_removed", label: "Cargo removido por inadimplência" },
  { key: "renewed", label: "Renovação confirmada" },
] as const;

type MsgKey = (typeof MESSAGE_KEYS)[number]["key"];
const isSnowflake = (v: string) => /^[0-9]{15,25}$/.test(v);
const errMsg = (e: unknown) =>
  (e as any)?.message?.replace(/^Error:\s*/, "") ?? "Algo deu errado. Tente novamente.";

function StateBlock({
  loading, error, empty, onRetry, children, emptyLabel = "Nada por aqui ainda.",
}: {
  loading: boolean; error: unknown; empty: boolean; onRetry: () => void;
  children: React.ReactNode; emptyLabel?: string;
}) {
  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  if (error)
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm text-muted-foreground">{errMsg(error)}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 size-3.5" />Tentar novamente
        </Button>
      </div>
    );
  if (empty)
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
        <Inbox className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  return <>{children}</>;
}

function DiscordBotPanel() {
  const [tab, setTab] = useState<"config" | "membros" | "logs">("config");
  const qcRoot = useQueryClient();
  const statusFn = useServerFn(getBotStatus);
  const status = useQuery({
    queryKey: ["bot-status"],
    queryFn: () => statusFn({ data: undefined as any }),
    retry: false,
  });

  const testFn = useServerFn(testBotConnection);
  const test = useMutation({
    mutationFn: async () => {
      const res = await testFn({ data: undefined as any });
      return res;
    },
    onSuccess: (res) => {
      if (res.ok) toast.success(`Bot respondeu em ${res.latencyMs}ms.`);
      else toast.error(res.error ?? "Bot não respondeu.");
      qcRoot.invalidateQueries({ queryKey: ["bot-status"] });
      qcRoot.invalidateQueries({ queryKey: ["bot-logs"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <Bot className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Bot do Discord</p>
            <p className="text-xs text-muted-foreground">Integração owner-only. Token vive apenas no servidor.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status.isLoading ? (
            <Badge variant="outline"><Loader2 className="mr-1 size-3 animate-spin" />verificando</Badge>
          ) : status.isError ? (
            <Badge variant="destructive">erro ao verificar</Badge>
          ) : status.data?.online ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">online</Badge>
          ) : (
            <Badge variant="destructive" title={status.data?.error ?? ""}>offline</Badge>
          )}
          <Badge variant={status.data?.secrets?.sharedSecret ? "outline" : "destructive"}>
            secret {status.data?.secrets?.sharedSecret ? "ok" : "ausente"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            disabled={test.isPending}
            onClick={() => { if (!test.isPending) test.mutate(); }}
          >
            {test.isPending
              ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Testando…</>
              : <><PlugZap className="mr-2 size-3.5" />Testar conexão</>}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => status.refetch()}>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {test.isPending ? (
        <div className="flex items-center gap-2 rounded-lg border bg-surface p-3 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Testando conectividade com o bot…
        </div>
      ) : test.isError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Falha ao executar o teste</p>
            <p className="text-muted-foreground">{errMsg(test.error)}</p>
          </div>
        </div>
      ) : test.data ? (
        test.data.ok ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <div>
              <p className="font-medium">Conexão OK — bot respondeu em {test.data.latencyMs}ms</p>
              <p className="text-muted-foreground">
                Testado às {new Date(test.data.checkedAt).toLocaleString("pt-BR")} · registrado nos logs
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Conexão falhou</p>
              <p className="text-muted-foreground">{test.data.error ?? "Motivo não informado pelo bot."}</p>
              <p className="text-muted-foreground">
                Testado às {new Date(test.data.checkedAt).toLocaleString("pt-BR")} · registrado nos logs
              </p>
            </div>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <PlugZap className="size-4" />
          Nenhum teste de conexão executado ainda.
        </div>
      )}

      {!status.isLoading && !status.isError && !status.data?.secrets?.apiUrl && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <span>
            Defina <code>DISCORD_BOT_API_URL</code> e <code>DISCORD_BOT_SHARED_SECRET</code> nas variáveis de
            ambiente do servidor (Discloud). O token do bot fica só no host do bot.
          </span>
        </div>
      )}

      <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-surface p-1 ring-1 ring-border sm:mx-0">
        {([["config", "Configuração"], ["membros", "Membros"], ["logs", "Logs"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "config" && <ConfigTab />}
      {tab === "membros" && <MembersTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

/* ------------------------------- CONFIG -------------------------------- */

function ConfigTab() {
  const qc = useQueryClient();
  const saveSettings = useServerFn(saveBotSettings);
  const saveMap = useServerFn(saveRoleMap);
  const saveMsgs = useServerFn(saveBotMessages);

  const cfg = useQuery({
    queryKey: ["bot-config"],
    retry: false,
    queryFn: async () => {
      const [s, c, m, msg] = await Promise.all([
        (supabase as any).from("discord_bot_settings").select("*").eq("id", true).maybeSingle(),
        supabase.from("cargos").select("id, name, color, weekly_amount").order("sort_order"),
        (supabase as any).from("discord_role_map").select("cargo_id, discord_role_id"),
        (supabase as any).from("discord_bot_messages").select("key, template"),
      ]);
      if (s.error) throw new Error(s.error.message);
      if (c.error) throw new Error(c.error.message);
      return {
        settings: s.data,
        cargos: (c.data ?? []) as any[],
        map: (m.data ?? []) as any[],
        messages: (msg.data ?? []) as any[],
      };
    },
  });

  const [form, setForm] = useState({
    guild_id: "", default_member_role_id: "", overdue_role_id: "",
    removal_after_days: 7, enabled: false,
  });
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cfg.data) return;
    const s = cfg.data.settings;
    setForm({
      guild_id: s?.guild_id ?? "",
      default_member_role_id: s?.default_member_role_id ?? "",
      overdue_role_id: s?.overdue_role_id ?? "",
      removal_after_days: s?.removal_after_days ?? 7,
      enabled: Boolean(s?.enabled),
    });
    setRoleMap(Object.fromEntries(cfg.data.map.map((r: any) => [r.cargo_id, r.discord_role_id])));
    setMessages(Object.fromEntries(cfg.data.messages.map((r: any) => [r.key, r.template])));
  }, [cfg.data]);

  const settingsErrors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const k of ["guild_id", "default_member_role_id", "overdue_role_id"] as const) {
      const v = (form as any)[k] as string;
      if (v && !isSnowflake(v)) e[k] = "Use apenas números (15 a 25 dígitos).";
    }
    if (form.enabled && !form.guild_id) e.guild_id = "Informe o Guild ID para ativar o bot.";
    if (form.removal_after_days < 1 || form.removal_after_days > 90) e.removal_after_days = "Entre 1 e 90 dias.";
    return e;
  }, [form]);

  const mSettings = useMutation({
    mutationFn: () => saveSettings({ data: form }),
    onSuccess: () => { toast.success("Configurações salvas."); qc.invalidateQueries({ queryKey: ["bot-config"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const mMap = useMutation({
    mutationFn: () =>
      saveMap({ data: { entries: Object.entries(roleMap).map(([cargo_id, discord_role_id]) => ({ cargo_id, discord_role_id: discord_role_id ?? "" })) } }),
    onSuccess: (r: any) => {
      toast.success(`Mapeamento salvo (${r?.mapped ?? 0} cargo(s)).`);
      qc.invalidateQueries({ queryKey: ["bot-config"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const mMsgs = useMutation({
    mutationFn: () =>
      saveMsgs({ data: { messages: MESSAGE_KEYS.map((m) => ({ key: m.key as MsgKey, template: messages[m.key] ?? "" })) } }),
    onSuccess: () => { toast.success("Mensagens salvas."); qc.invalidateQueries({ queryKey: ["bot-config"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const invalidMap = Object.values(roleMap).some((v) => v && !isSnowflake(v));

  return (
    <StateBlock
      loading={cfg.isLoading}
      error={cfg.error}
      empty={false}
      onRetry={() => cfg.refetch()}
    >
      <div className="space-y-6">
        {/* Servidor */}
        <section className="space-y-4 rounded-lg border bg-surface p-4">
          <h2 className="text-sm font-medium">Servidor</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guild ID (servidor)" error={settingsErrors.guild_id}>
              <Input inputMode="numeric" placeholder="123456789012345678" value={form.guild_id}
                onChange={(e) => setForm({ ...form, guild_id: e.target.value.trim() })} />
            </Field>
            <Field label="Cargo padrão de membro (ID)" error={settingsErrors.default_member_role_id}>
              <Input inputMode="numeric" placeholder="opcional" value={form.default_member_role_id}
                onChange={(e) => setForm({ ...form, default_member_role_id: e.target.value.trim() })} />
            </Field>
            <Field label="Cargo de inadimplente (ID)" error={settingsErrors.overdue_role_id}>
              <Input inputMode="numeric" placeholder="opcional" value={form.overdue_role_id}
                onChange={(e) => setForm({ ...form, overdue_role_id: e.target.value.trim() })} />
            </Field>
            <Field label="Remover cargos após (dias de atraso)" error={settingsErrors.removal_after_days}>
              <Input type="number" min={1} max={90} value={form.removal_after_days}
                onChange={(e) => setForm({ ...form, removal_after_days: Number(e.target.value) || 0 })} />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            <span className="text-sm">Automação ativa (cargos e DMs automáticos)</span>
          </div>
          <Button size="sm" disabled={Object.keys(settingsErrors).length > 0 || mSettings.isPending}
            onClick={() => mSettings.mutate()}>
            {mSettings.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Save className="mr-2 size-3.5" />}
            Salvar configurações
          </Button>
        </section>

        {/* Mapeamento */}
        <section className="space-y-4 rounded-lg border bg-surface p-4">
          <h2 className="text-sm font-medium">Mapeamento de cargos</h2>
          {cfg.data?.cargos.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum cargo cadastrado no SaaS ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {cfg.data?.cargos.map((c: any) => {
                const v = roleMap[c.id] ?? "";
                const bad = v && !isSnowflake(v);
                return (
                  <div key={c.id} className="grid gap-2 sm:grid-cols-[1fr_1.2fr] sm:items-center">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="size-2 rounded-full" style={{ background: c.color || "#888" }} />
                      {c.name}
                    </span>
                    <div>
                      <Input inputMode="numeric" placeholder="ID do cargo no Discord (vazio = remover)"
                        value={v} onChange={(e) => setRoleMap({ ...roleMap, [c.id]: e.target.value.trim() })} />
                      {bad && <p className="mt-1 text-xs text-destructive">Use apenas números (15 a 25 dígitos).</p>}
                    </div>
                  </div>
                );
              })}
              <Button size="sm" disabled={invalidMap || mMap.isPending} onClick={() => mMap.mutate()}>
                {mMap.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Save className="mr-2 size-3.5" />}
                Salvar mapeamento
              </Button>
            </div>
          )}
        </section>

        {/* Mensagens */}
        <section className="space-y-4 rounded-lg border bg-surface p-4">
          <h2 className="text-sm font-medium">Mensagens automáticas (DM)</h2>
          <p className="text-xs text-muted-foreground">
            Variáveis: <code>{"{nome}"}</code>, <code>{"{valor}"}</code>, <code>{"{vencimento}"}</code>. Menções em
            massa são bloqueadas automaticamente.
          </p>
          {MESSAGE_KEYS.map((m) => {
            const v = messages[m.key] ?? "";
            return (
              <div key={m.key} className="space-y-1">
                <Label className="text-xs">{m.label}</Label>
                <Textarea rows={2} maxLength={1800} value={v}
                  onChange={(e) => setMessages({ ...messages, [m.key]: e.target.value })} />
                <p className="text-right text-[11px] text-muted-foreground">{v.length}/1800</p>
              </div>
            );
          })}
          <Button size="sm" disabled={mMsgs.isPending} onClick={() => mMsgs.mutate()}>
            {mMsgs.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Save className="mr-2 size-3.5" />}
            Salvar mensagens
          </Button>
        </section>
      </div>
    </StateBlock>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------- MEMBROS ------------------------------- */

function MembersTab() {
  const [q, setQ] = useState("");
  const [dm, setDm] = useState<{ id: string; name: string } | null>(null);
  const [dmText, setDmText] = useState("");
  const [roleDlg, setRoleDlg] = useState<{ id: string; name: string; mode: "assign" | "remove" } | null>(null);
  const [roleCargo, setRoleCargo] = useState<string>("");

  const assignFn = useServerFn(assignDiscordRole);
  const removeFn = useServerFn(removeDiscordRole);
  const dmFn = useServerFn(sendDiscordDm);
  const syncFn = useServerFn(syncDiscordUser);

  const members = useQuery({
    queryKey: ["bot-members"],
    retry: false,
    queryFn: async () => {
      const [{ data: profs, error }, { data: cargos }, { data: pays }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, discord_id, discord_username, cargo_id, form_status")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("cargos").select("id, name"),
        supabase.from("payments").select("user_id, status, due_date").order("due_date", { ascending: false }),
      ]);
      if (error) throw new Error(error.message);
      const cargoName = new Map((cargos ?? []).map((c: any) => [c.id, c.name]));
      const lastPay = new Map<string, string>();
      for (const p of (pays ?? []) as any[]) if (!lastPay.has(p.user_id)) lastPay.set(p.user_id, p.status);
      return (profs ?? []).map((p: any) => ({
        ...p,
        cargo_name: p.cargo_id ? cargoName.get(p.cargo_id) ?? "—" : "—",
        payment_status: lastPay.get(p.id) ?? null,
      }));
    },
  });

  const cargos = useQuery({
    queryKey: ["bot-cargos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cargos").select("id, name").order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = members.data ?? [];
    if (!term) return list;
    return list.filter((m: any) =>
      [m.first_name, m.last_name, m.email, m.discord_username, m.discord_id]
        .filter(Boolean).join(" ").toLowerCase().includes(term),
    );
  }, [members.data, q]);

  const mRole = useMutation({
    mutationFn: async () => {
      if (!roleDlg || !roleCargo) throw new Error("Escolha um cargo.");
      const fn = roleDlg.mode === "assign" ? assignFn : removeFn;
      return fn({ data: { user_id: roleDlg.id, cargo_id: roleCargo } });
    },
    onSuccess: () => { toast.success("Ação enviada ao bot."); setRoleDlg(null); setRoleCargo(""); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const mDm = useMutation({
    mutationFn: async () => {
      if (!dm) throw new Error("Membro inválido.");
      const text = dmText.trim();
      if (!text) throw new Error("Escreva uma mensagem.");
      return dmFn({ data: { user_id: dm.id, message: text } });
    },
    onSuccess: () => { toast.success("DM enviada."); setDm(null); setDmText(""); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const mSync = useMutation({
    mutationFn: (id: string) => syncFn({ data: { user_id: id } }),
    onSuccess: () => toast.success("Sincronização solicitada."),
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, email ou Discord…" value={q}
          onChange={(e) => setQ(e.target.value)} />
      </div>

      <StateBlock
        loading={members.isLoading}
        error={members.error}
        empty={filtered.length === 0}
        emptyLabel={q ? "Nenhum membro encontrado para essa busca." : "Nenhum membro cadastrado ainda."}
        onRetry={() => members.refetch()}
      >
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Membro</th>
                <th className="p-3 text-left">Discord</th>
                <th className="p-3 text-left">Cargo</th>
                <th className="p-3 text-left">Formulário</th>
                <th className="p-3 text-left">Pagamento</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m: any) => {
                const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email;
                const linked = Boolean(m.discord_id);
                return (
                  <tr key={m.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </td>
                    <td className="p-3 text-xs">
                      {linked ? (
                        <>
                          <div>{m.discord_username ?? "—"}</div>
                          <div className="text-muted-foreground">{m.discord_id}</div>
                        </>
                      ) : (
                        <Badge variant="outline">não vinculado</Badge>
                      )}
                    </td>
                    <td className="p-3">{m.cargo_name}</td>
                    <td className="p-3"><Badge variant="outline">{m.form_status}</Badge></td>
                    <td className="p-3">
                      {m.payment_status ? <Badge variant="outline">{m.payment_status}</Badge> :
                        <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={!linked}
                          onClick={() => { setRoleDlg({ id: m.id, name, mode: "assign" }); setRoleCargo(m.cargo_id ?? ""); }}>
                          <ShieldCheck className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={!linked}
                          onClick={() => { setRoleDlg({ id: m.id, name, mode: "remove" }); setRoleCargo(m.cargo_id ?? ""); }}>
                          <ShieldX className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={!linked}
                          onClick={() => { setDm({ id: m.id, name }); setDmText(""); }}>
                          <Send className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={!linked || mSync.isPending}
                          onClick={() => mSync.mutate(m.id)}>
                          {mSync.isPending && mSync.variables === m.id
                            ? <Loader2 className="size-3.5 animate-spin" />
                            : <RefreshCw className="size-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </StateBlock>

      {/* Dialog cargo */}
      <Dialog open={!!roleDlg} onOpenChange={(o) => !o && setRoleDlg(null)}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{roleDlg?.mode === "assign" ? "Atribuir cargo" : "Remover cargo"}</DialogTitle>
            <DialogDescription>{roleDlg?.name}</DialogDescription>
          </DialogHeader>
          <Select value={roleCargo} onValueChange={setRoleCargo}>
            <SelectTrigger><SelectValue placeholder="Escolha o cargo do SaaS" /></SelectTrigger>
            <SelectContent>
              {(cargos.data ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoleDlg(null)}>Cancelar</Button>
            <Button disabled={!roleCargo || mRole.isPending} onClick={() => mRole.mutate()}>
              {mRole.isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog DM */}
      <Dialog open={!!dm} onOpenChange={(o) => !o && setDm(null)}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar DM</DialogTitle>
            <DialogDescription>{dm?.name}</DialogDescription>
          </DialogHeader>
          <Textarea rows={5} maxLength={1800} value={dmText} onChange={(e) => setDmText(e.target.value)}
            placeholder="Mensagem…" />
          <p className="text-right text-[11px] text-muted-foreground">{dmText.length}/1800</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDm(null)}>Cancelar</Button>
            <Button disabled={!dmText.trim() || mDm.isPending} onClick={() => mDm.mutate()}>
              {mDm.isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------- LOGS --------------------------------- */

function LogsTab() {
  const [action, setAction] = useState<string>("all");
  const logs = useQuery({
    queryKey: ["bot-logs"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bot_activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });

  const actions = useMemo(
    () => Array.from(new Set((logs.data ?? []).map((l: any) => l.action))),
    [logs.data],
  );
  const rows = useMemo(
    () => (logs.data ?? []).filter((l: any) => action === "all" || l.action === action),
    [logs.data, action],
  );

  function exportCsv() {
    try {
      const head = "data,acao,status,discord_id,detalhe\n";
      const body = rows
        .map((l: any) =>
          [new Date(l.created_at).toISOString(), l.action, l.status, l.discord_id ?? "",
            JSON.stringify(l.detail ?? {}).replace(/"/g, "'")]
            .map((v) => `"${String(v)}"`).join(","),
        )
        .join("\n");
      const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "bot_activity_logs.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exportado.");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => logs.refetch()}>
          <RefreshCw className="mr-2 size-3.5" />Atualizar
        </Button>
        <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={exportCsv}>
          <Download className="mr-2 size-3.5" />CSV
        </Button>
      </div>

      <StateBlock
        loading={logs.isLoading}
        error={logs.error}
        empty={rows.length === 0}
        emptyLabel="Nenhuma atividade registrada ainda."
        onRetry={() => logs.refetch()}
      >
        <ul className="space-y-2">
          {rows.map((l: any) => (
            <li key={l.id} className="flex items-start gap-3 rounded-lg border bg-surface p-3">
              {l.status === "success"
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{l.action}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.discord_id ? `Discord ${l.discord_id} · ` : ""}
                  {l.detail?.error ?? l.detail?.preview ?? "—"}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {new Date(l.created_at).toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      </StateBlock>
    </div>
  );
}
