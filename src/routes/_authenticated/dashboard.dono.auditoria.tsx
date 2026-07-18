import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Search, Filter, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/dono/auditoria")({
  component: OwnerAuditoria,
});

function OwnerAuditoria() {
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const logsQ = useQuery({
    queryKey: ["audit-log", actionFilter],
    queryFn: async () => {
      let query = supabase.from("audit_log")
        .select("*, profiles!audit_log_actor_id_fkey(first_name,last_name,email)")
        .order("created_at", { ascending: false });
      
      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data } = await query.limit(500);
      return data ?? [];
    },
  });

  const filtered = (logsQ.data ?? []).filter((l: any) => {
    if (!q) return true;
    const search = q.toLowerCase();
    const actorName = `${l.profiles?.first_name} ${l.profiles?.last_name}`.toLowerCase();
    const metadata = JSON.stringify(l.metadata).toLowerCase();
    return actorName.includes(search) || l.action.toLowerCase().includes(search) || metadata.includes(search);
  });

  const uniqueActions = Array.from(new Set((logsQ.data ?? []).map((l: any) => l.action)));

  if (logsQ.isLoading) return <Loader2 className="size-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar logs..." className="input pl-8" />
          </div>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="input w-40 text-xs">
            <option value="all">Todas ações</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="text-xs text-muted-foreground">Mostrando {filtered.length} registros</div>
      </div>

      <div className="overflow-hidden rounded-lg bg-surface ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-4 py-3">Quando</th><th className="px-4 py-3">Quem</th><th className="px-4 py-3">Ação</th><th className="px-4 py-3">Alvo</th><th className="px-4 py-3">Detalhes</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.map((l: any) => (
            <tr key={l.id} className="align-top hover:bg-surface-muted/50">
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
              <td className="px-4 py-2.5">{l.profiles?.first_name} {l.profiles?.last_name}<div className="text-xs text-muted-foreground">{l.profiles?.email}</div></td>
              <td className="px-4 py-2.5"><code className="text-xs">{l.action}</code></td>
              <td className="px-4 py-2.5 text-xs">{l.entity ?? "—"} <span className="text-muted-foreground">{l.entity_id ?? ""}</span></td>
              <td className="px-4 py-2.5 text-xs">
                <pre className="whitespace-pre-wrap font-mono">{Object.keys(l.metadata ?? {}).length ? JSON.stringify(l.metadata) : ""}</pre>
              </td>
            </tr>
          ))}
          {logsQ.data && logsQ.data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum evento registrado ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}