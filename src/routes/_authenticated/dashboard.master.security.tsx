import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shield, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/master/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["master-security"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log")
        .select("id, action, entity, entity_id, actor_id, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (query.data ?? []).filter((l: any) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return `${l.action} ${l.entity ?? ""}`.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-primary" />
        <h2 className="text-lg font-medium">Auditoria Global (últimos 500)</h2>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por ação ou entidade…" className="input w-full pl-9" />
      </div>
      <div className="rounded-xl bg-surface ring-1 ring-border overflow-hidden">
        {query.isLoading && <div className="p-6 text-center"><Loader2 className="inline size-4 animate-spin" /></div>}
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2 text-left">Quando</th><th className="px-4 py-2 text-left">Ação</th><th className="px-4 py-2 text-left">Entidade</th><th className="px-4 py-2 text-left">Ator</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((l: any) => (
              <tr key={l.id}>
                <td className="px-4 py-2 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                <td className="px-4 py-2 text-xs">{l.entity ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.actor_id?.slice(0, 8) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !query.isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Nenhum log encontrado.</div>}
      </div>
    </div>
  );
}
