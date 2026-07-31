import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/useSiteSettings";

export const Route = createFileRoute("/_authenticated/dashboard/dono/repasses")({
  component: RecrutadoresPage,
});

function RecrutadoresPage() {
  const q = useQuery({
    queryKey: ["recruiters-overview"],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,email,status,recruited_by");
      if (error) throw error;
      const rows = members ?? [];

      const { data: payments } = await supabase
        .from("payments")
        .select("user_id,amount,status,recruiter_admin_id");

      const byId = new Map(rows.map((m: any) => [m.id, m]));
      const recruiterIds = Array.from(
        new Set(rows.map((m: any) => m.recruited_by).filter(Boolean))
      ) as string[];

      return recruiterIds.map((rid) => {
        const rec = byId.get(rid);
        const recruited = rows.filter((m: any) => m.recruited_by === rid);
        const pays = (payments ?? []).filter(
          (p: any) => p.recruiter_admin_id === rid || byId.get(p.user_id)?.recruited_by === rid
        );
        const paid = pays.filter((p: any) => p.status === "approved");
        const open = pays.filter((p: any) => p.status !== "approved");
        return {
          id: rid,
          name: rec ? `${rec.first_name ?? ""} ${rec.last_name ?? ""}`.trim() || rec.email : "—",
          email: rec?.email ?? "",
          total: recruited.length,
          approved: recruited.filter((m: any) => m.status === "approved").length,
          received: paid.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0),
          openCount: open.length,
          openAmount: open.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0),
        };
      }).sort((a, b) => b.total - a.total);
    },
  });

  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  const data = q.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Recrutadores</h1>
        <p className="text-sm text-muted-foreground">
          Todos os membros pagam no PIX oficial do Dono. Aqui você acompanha quantos membros cada recrutador aprovou e quanto eles geraram.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg bg-surface ring-1 ring-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Recrutador</th>
              <th className="px-4 py-2 text-left">Recrutados</th>
              <th className="px-4 py-2 text-left">Aprovados</th>
              <th className="px-4 py-2 text-left">Recebido</th>
              <th className="px-4 py-2 text-left">Em aberto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((r) => (
              <tr key={r.id} className="hover:bg-surface-muted/50">
                <td className="px-4 py-2.5">
                  {r.name}
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </td>
                <td className="px-4 py-2.5">{r.total}</td>
                <td className="px-4 py-2.5">{r.approved}</td>
                <td className="px-4 py-2.5 text-success">{formatBRL(r.received)}</td>
                <td className="px-4 py-2.5 text-warning">
                  {formatBRL(r.openAmount)}
                  <span className="ml-1 text-xs text-muted-foreground">({r.openCount})</span>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum recrutador com membros ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}