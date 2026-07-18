import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/dono/auditoria")({
  component: OwnerAuditoria,
});

function OwnerAuditoria() {
  const logsQ = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_log")
        .select("*, profiles!audit_log_actor_id_fkey(first_name,last_name,email)")
        .order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  if (logsQ.isLoading) return <Loader2 className="size-5 animate-spin" />;

  return (
    <div className="overflow-hidden rounded-lg bg-surface ring-1 ring-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-4 py-3">Quando</th><th className="px-4 py-3">Quem</th><th className="px-4 py-3">Ação</th><th className="px-4 py-3">Alvo</th><th className="px-4 py-3">Detalhes</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(logsQ.data ?? []).map((l: any) => (
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