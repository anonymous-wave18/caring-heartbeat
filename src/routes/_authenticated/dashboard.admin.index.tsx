import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useRoles, computeRoleFlags } from "@/lib/useRoles";
import { toast } from "sonner";
import { Check, X, Search, Trash2, Loader2, Download, TrendingUp, Users, FileCheck, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "./dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/admin/")({
  component: AdminPage,
});

type StatusFilter = "all" | "pending" | "approved" | "rejected";

function AdminPage() {
  const { user } = Route.useRouteContext();
  const rolesQ = useRoles(user.id);
  const { isOwner } = computeRoleFlags(rolesQ.data);

  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");

  const membersQuery = useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, user_roles!user_roles_user_id_fkey(role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "pending" }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.status === "approved" ? "Membro aprovado" : v.status === "rejected" ? "Cadastro rejeitado" : "Status revertido",
      );
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["pending-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Membro removido");
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["pending-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = membersQuery.data ?? [];
  const filtered = all.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    const searchVal = search.toLowerCase().trim();
    if (!searchVal) return true;
    const fullName = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
    const email = (p.email || "").toLowerCase();
    const discord = (p.discord_username || "").toLowerCase();
    return fullName.includes(searchVal) || email.includes(searchVal) || discord.includes(searchVal);
  });

  const counts = {
    all: all.length,
    pending: all.filter((p) => p.status === "pending").length,
    approved: all.filter((p) => p.status === "approved" && !(p as any).user_roles?.some((r: any) => r.role === 'admin' || r.role === 'owner')).length,
    rejected: all.filter((p) => p.status === "rejected").length,
  };

  const chartData = useMemo(() => {
    return [
      { name: "Pendentes", value: counts.pending, color: "#f59e0b" },
      { name: "Aprovados", value: counts.approved, color: "#10b981" },
      { name: "Rejeitados", value: counts.rejected, color: "#ef4444" },
    ];
  }, [counts]);

  const growthData = useMemo(() => {
    // Group by month
    const groups: Record<string, number> = {};
    all.forEach(p => {
      const month = new Date(p.created_at).toLocaleDateString("pt-BR", { month: "short" });
      groups[month] = (groups[month] || 0) + 1;
    });
    return Object.entries(groups).map(([name, total]) => ({ name, total }));
  }, [all]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Membros Ativos (Recrutas)" value={counts.approved} trend="+12%" icon={<Users className="size-4" />} />
        <MetricCard label="Pendentes" value={counts.pending} trend="ação requerida" highlight icon={<FileCheck className="size-4" />} />
        <MetricCard label="Taxa de Aprovação" value={`${all.length ? Math.round((counts.approved / all.length) * 100) : 0}%`} icon={<TrendingUp className="size-4" />} />
        <MetricCard label="Total Cadastros" value={all.length} icon={<BarChart3 className="size-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-surface p-6 ring-1 ring-border">
          <h3 className="mb-6 text-sm font-medium text-muted-foreground uppercase tracking-wider">Status de Recrutamento</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-surface p-6 ring-1 ring-border">
          <h3 className="mb-6 text-sm font-medium text-muted-foreground uppercase tracking-wider">Crescimento Mensal</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                  itemStyle={{ color: "#fff" }}
                />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Cadastros</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gerencie cadastros, aprovações e membros da Malta.</p>
        </div>
        {isOwner && (
        <div className="flex flex-col items-end gap-1 rounded-lg bg-surface p-3 text-[10px] ring-1 ring-border">
          <div className="font-mono text-muted-foreground uppercase tracking-widest">Informações de Conexão</div>
          <div className="flex gap-2">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Login CLI:</span>
              <code className="font-mono text-primary font-bold">npx supabase login</code>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Link Projeto:</span>
              <code className="font-mono text-primary font-bold">npx supabase link --project-ref lthxjvqjisjuuetoebrz</code>
            </div>
          </div>
        </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-surface p-1 ring-1 ring-border">
          {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {labelFor(f)}
              <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail, Discord…"
            className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-border">
        {membersQuery.isLoading ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">Nenhum membro encontrado.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((p) => (
              <div key={p.id} className="grid gap-3 px-6 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {p.first_name} {p.last_name}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.email} · {p.discord_username ?? "sem Discord"} · {p.city ?? "—"}/{p.state ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <div className="text-[10px] text-muted-foreground uppercase tracking-tight">Formulário:</div>
                   <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1 ${
                     p.form_status === 'approved' ? 'bg-success/10 text-success ring-success/30' :
                     p.form_status === 'submitted' ? 'bg-warning/10 text-warning ring-warning/30' :
                     p.form_status === 'rejected' ? 'bg-destructive/10 text-destructive ring-destructive/30' :
                     'bg-surface-muted text-muted-foreground ring-border'
                   }`}>
                     {p.form_status === 'not_submitted' ? 'Não enviado' : p.form_status === 'submitted' ? 'Em análise' : p.form_status === 'approved' ? 'Aprovado' : 'Recusado'}
                   </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.status !== "approved" && (
                    <button
                      onClick={() => {
                        if (confirm(`Aprovar ${p.first_name ?? p.email}?`))
                          decide.mutate({ id: p.id, status: "approved" });
                      }}
                      disabled={decide.isPending}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground ring-1 ring-primary/60 transition-colors hover:bg-primary-glow disabled:opacity-60"
                    >
                      <Check className="size-3.5" /> Aprovar
                    </button>
                  )}
                  {p.status !== "rejected" && (
                    <button
                      onClick={() => {
                        const reason = prompt("Motivo da rejeição (opcional):");
                        if (reason !== null)
                          decide.mutate({ id: p.id, status: "rejected" });
                      }}
                      disabled={decide.isPending}
                      className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:text-destructive"
                    >
                      <X className="size-3.5" /> Rejeitar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Remover ${p.first_name ?? p.email} definitivamente?`)) remove.mutate(p.id);
                    }}
                    disabled={remove.isPending}
                    className="inline-flex items-center justify-center rounded-md bg-surface-muted p-1.5 text-muted-foreground ring-1 ring-border transition-colors hover:text-destructive"
                    title="Excluir"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      const csvRows = filtered.map(m => {
                        const row = [
                          m.id,
                          `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
                          m.email,
                          m.status,
                          m.form_status,
                          m.pix_key ?? "",
                          m.pix_key_type ?? "",
                          m.pix_beneficiary ?? ""
                        ];
                        return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
                      });
                      const header = "ID,Nome,Email,Status,Formulario,PIX_Chave,PIX_Tipo,PIX_Beneficiario";
                      const csv = header + "\n" + csvRows.join("\n");
                      const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.setAttribute('hidden', '');
                      a.setAttribute('href', url);
                      a.setAttribute('download', `membros_malta_${new Date().toISOString().split('T')[0]}.csv`);
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:text-primary"
                    title="Exportar Membros e PIXs"
                  >
                    <Download className="size-3" /> Exportar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, highlight, icon }: { label: string; value: string | number; trend?: string; highlight?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-xl p-5 ring-1 ${highlight ? "bg-primary/5 ring-primary/20" : "bg-surface ring-border"}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-primary/80">{label}</div>
        {icon && <div className="text-primary/40">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {trend && <div className={`text-[10px] font-medium ${highlight ? "text-primary" : "text-success"}`}>{trend}</div>}
      </div>
    </div>
  );
}

function labelFor(f: StatusFilter) {
  return f === "all" ? "Todos" : f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : "Rejeitados";
}

function StatusBadge({ status }: { status: Profile["status"] }) {
  const map = {
    pending: { text: "Pendente", cls: "bg-warning/10 text-warning ring-warning/30" },
    approved: { text: "Aprovado", cls: "bg-success/10 text-success ring-success/30" },
    rejected: { text: "Rejeitado", cls: "bg-destructive/10 text-destructive ring-destructive/30" },
  }[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ${map.cls}`}>
      {map.text}
    </span>
  );
}
