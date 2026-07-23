import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Loader2, Search, ChevronDown, CheckCircle2, XCircle, UserPlus, UserMinus,
  ShieldCheck, FileText, DollarSign, LogIn, LogOut, Settings, Eye, Trash2,
  Pencil, Send, AlertCircle, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/dono/auditoria")({
  component: OwnerAuditoria,
});

type LogRow = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  actor_id: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
  profiles?: { first_name?: string; last_name?: string; email?: string } | null;
};

type ActionMeta = {
  label: string;
  icon: any;
  tone: "success" | "danger" | "warning" | "info" | "neutral";
  describe: (l: LogRow, actor: string) => string;
};

const ACTION_MAP: Record<string, ActionMeta> = {
  "form.approved":   { label: "Formulário aprovado", icon: CheckCircle2, tone: "success",
    describe: (l, a) => `${a} aprovou o formulário de recrutamento.` },
  "form.rejected":   { label: "Formulário rejeitado", icon: XCircle, tone: "danger",
    describe: (l, a) => `${a} rejeitou um formulário.` },
  "form.submitted":  { label: "Formulário enviado", icon: Send, tone: "info",
    describe: (l, a) => `${a} enviou um formulário de recrutamento.` },
  "member.added":    { label: "Membro adicionado", icon: UserPlus, tone: "success",
    describe: (l, a) => `${a} adicionou um novo membro.` },
  "member.removed":  { label: "Membro removido", icon: UserMinus, tone: "danger",
    describe: (l, a) => `${a} removeu um membro.` },
  "role.granted":    { label: "Cargo concedido", icon: ShieldCheck, tone: "success",
    describe: (l, a) => `${a} concedeu o cargo ${l.metadata?.role ?? ""}.`.trim() },
  "role.revoked":    { label: "Cargo revogado", icon: ShieldCheck, tone: "warning",
    describe: (l, a) => `${a} revogou um cargo.` },
  "role.grant":      { label: "Cargo concedido", icon: ShieldCheck, tone: "success",
    describe: (l, a) => `${a} concedeu o cargo ${l.metadata?.role ?? ""}.`.trim() },
  "role.revoke":     { label: "Cargo revogado", icon: ShieldCheck, tone: "warning",
    describe: (l, a) => `${a} revogou um cargo${l.metadata?.role ? ` (${l.metadata.role})` : ""}.` },
  "payment.created": { label: "Cobrança gerada", icon: DollarSign, tone: "info",
    describe: (l, a) => `${a} gerou uma cobrança semanal.` },
  "payment.paid":    { label: "Pagamento confirmado", icon: DollarSign, tone: "success",
    describe: (l, a) => `${a} confirmou um pagamento.` },
  "payment.rejected":{ label: "Pagamento rejeitado", icon: XCircle, tone: "danger",
    describe: (l, a) => `${a} rejeitou um comprovante de pagamento.` },
  "document.viewed": { label: "Documento visualizado", icon: Eye, tone: "info",
    describe: (l, a) => `${a} visualizou um documento sensível.` },
  "document.deleted":{ label: "Documento apagado", icon: Trash2, tone: "danger",
    describe: (l, a) => `${a} apagou um documento.` },
  "profile.updated": { label: "Perfil atualizado", icon: Pencil, tone: "neutral",
    describe: (l, a) => `${a} editou o próprio perfil.` },
  "settings.updated":{ label: "Configurações alteradas", icon: Settings, tone: "warning",
    describe: (l, a) => `${a} alterou configurações do sistema.` },
  "settings.update": { label: "Configurações alteradas", icon: Settings, tone: "warning",
    describe: (l, a) => `${a} alterou configurações do sistema${l.metadata?.key ? ` (${l.metadata.key})` : ""}.` },
  "form.approve":    { label: "Formulário aprovado", icon: CheckCircle2, tone: "success",
    describe: (l, a) => `${a} aprovou um formulário de recrutamento.` },
  "form.reject":     { label: "Formulário rejeitado", icon: XCircle, tone: "danger",
    describe: (l, a) => `${a} rejeitou um formulário.` },
  "payment.approve": { label: "Pagamento confirmado", icon: DollarSign, tone: "success",
    describe: (l, a) => `${a} confirmou um pagamento.` },
  "payment.reject":  { label: "Pagamento rejeitado", icon: XCircle, tone: "danger",
    describe: (l, a) => `${a} rejeitou um comprovante.` },
  "auth.login":      { label: "Login", icon: LogIn, tone: "neutral",
    describe: (l, a) => `${a} entrou na plataforma.` },
  "auth.logout":     { label: "Logout", icon: LogOut, tone: "neutral",
    describe: (l, a) => `${a} saiu da plataforma.` },
};

function metaFor(action: string): ActionMeta {
  return ACTION_MAP[action] ?? {
    label: action,
    icon: Activity,
    tone: "neutral",
    describe: (_l, a) => `${a} executou ${action}.`,
  };
}

const toneClasses: Record<ActionMeta["tone"], string> = {
  success: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  danger:  "bg-red-500/10 text-red-600 ring-red-500/20",
  warning: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  info:    "bg-primary/10 text-primary ring-primary/20",
  neutral: "bg-muted text-muted-foreground ring-border",
};

function actorName(l: LogRow): string {
  const p = l.profiles;
  const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return name || p?.email || "Sistema";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "há poucos segundos";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatMetaEntry(key: string, value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (key === "ua" || key === "platform" || key === "user_id") return null;
  if (typeof value === "object") return `${key}: ${JSON.stringify(value)}`;
  return `${key}: ${value}`;
}

function OwnerAuditoria() {
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const logsQ = useQuery({
    queryKey: ["audit-log", actionFilter],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false });

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data: logs, error } = await query.limit(500);
      if (error) {
        console.error("[auditoria] audit_log error:", error);
        throw error;
      }
      const rows = logs ?? [];
      const actorIds = Array.from(
        new Set(rows.map((r: any) => r.actor_id).filter(Boolean)),
      ) as string[];
      let profileMap = new Map<string, any>();
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", actorIds);
        profileMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      }
      return rows.map((r: any) => ({ ...r, profiles: profileMap.get(r.actor_id) ?? null })) as LogRow[];
    },
  });

  const filtered = (logsQ.data ?? []).filter((l) => {
    if (!q) return true;
    const search = q.toLowerCase();
    const meta = metaFor(l.action);
    const a = actorName(l).toLowerCase();
    return (
      a.includes(search) ||
      l.action.toLowerCase().includes(search) ||
      meta.label.toLowerCase().includes(search) ||
      JSON.stringify(l.metadata ?? {}).toLowerCase().includes(search)
    );
  });

  const uniqueActions = Array.from(new Set((logsQ.data ?? []).map((l) => l.action)));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (logsQ.isLoading) return <Loader2 className="size-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por pessoa, ação ou detalhe..." className="input pl-8" />
          </div>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input w-40 text-xs">
            <option value="all">Todas ações</option>
            {uniqueActions.map((a) => <option key={a} value={a}>{metaFor(a).label}</option>)}
          </select>
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} evento{filtered.length === 1 ? "" : "s"}</div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg bg-surface p-8 text-center text-sm text-muted-foreground ring-1 ring-border">
          <AlertCircle className="mx-auto mb-2 size-6 opacity-50" />
          Nenhum evento encontrado.
        </div>
      )}

      <ol className="relative space-y-3 border-l border-border pl-6">
        {filtered.map((l) => {
          const meta = metaFor(l.action);
          const Icon = meta.icon;
          const actor = actorName(l);
          const isOpen = expanded.has(l.id);
          const metaEntries = Object.entries(l.metadata ?? {})
            .map(([k, v]) => formatMetaEntry(k, v))
            .filter(Boolean) as string[];
          const hasDetails = metaEntries.length > 0 || l.entity_id;

          return (
            <li key={l.id} className="relative">
              <span className={`absolute -left-[34px] top-3 grid size-7 place-items-center rounded-full ring-2 ring-background ${toneClasses[meta.tone]}`}>
                <Icon className="size-3.5" />
              </span>
              <div className="rounded-lg bg-surface p-4 ring-1 ring-border transition hover:ring-primary/30">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{meta.label}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{meta.describe(l, actor)}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span title={new Date(l.created_at).toLocaleString("pt-BR")}>{timeAgo(l.created_at)}</span>
                    {hasDetails && (
                      <button onClick={() => toggle(l.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-muted/60">
                        Detalhes
                        <ChevronDown className={`size-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && hasDetails && (
                  <div className="mt-3 space-y-1 rounded-md bg-surface-muted/40 p-3 text-xs">
                    {l.entity && (
                      <div><span className="text-muted-foreground">Alvo: </span>{l.entity}{l.entity_id ? ` · ${l.entity_id}` : ""}</div>
                    )}
                    {metaEntries.map((e, i) => <div key={i}>{e}</div>)}
                    <div className="text-muted-foreground">
                      {new Date(l.created_at).toLocaleString("pt-BR")} · por {actor}
                      {l.profiles?.email ? ` (${l.profiles.email})` : ""}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}