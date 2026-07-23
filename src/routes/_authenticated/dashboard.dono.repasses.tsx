import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/useSiteSettings";

export const Route = createFileRoute("/_authenticated/dashboard/dono/repasses")({
  component: RepassesPage,
});

function RepassesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["repasses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments")
        .select("*")
        .in("transfer_status", ["pending", "confirmed"])
        .order("approved_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const uids = Array.from(new Set(rows.flatMap((r: any) => [r.user_id, r.recruiter_admin_id].filter(Boolean))));
      if (uids.length === 0) return rows;
      const { data: profs } = await supabase.from("profiles").select("id,first_name,last_name,email").in("id", uids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({ ...r, member: map.get(r.user_id), recruiter: r.recruiter_admin_id ? map.get(r.recruiter_admin_id) : null }));
    },
  });

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: "confirmed" | "rejected" | "none" }) => {
      const { error } = await supabase.from("payments").update({ transfer_status: args.status }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atualizado."); qc.invalidateQueries({ queryKey: ["repasses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Repasses dos recrutadores</h1>
        <p className="text-sm text-muted-foreground">Confirme quando o admin enviar o PIX recebido dos membros.</p>
      </div>
      <div className="overflow-x-auto rounded-lg bg-surface ring-1 ring-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Recrutador</th>
              <th className="px-4 py-2 text-left">Membro</th>
              <th className="px-4 py-2 text-left">Semana</th>
              <th className="px-4 py-2 text-left">Valor</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(q.data ?? []).map((p: any) => (
              <tr key={p.id} className="hover:bg-surface-muted/50">
                <td className="px-4 py-2.5">{p.recruiter ? `${p.recruiter.first_name ?? ""} ${p.recruiter.last_name ?? ""}` : "—"}</td>
                <td className="px-4 py-2.5">{p.member ? `${p.member.first_name ?? ""} ${p.member.last_name ?? ""}` : "—"}</td>
                <td className="px-4 py-2.5">{p.week_start}</td>
                <td className="px-4 py-2.5">{formatBRL(p.amount)}</td>
                <td className="px-4 py-2.5">{p.transfer_status}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    {p.transfer_status !== "confirmed" && (
                      <button title="Confirmar repasse" onClick={() => setStatus.mutate({ id: p.id, status: "confirmed" })}
                        className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20"><Check className="size-4" /></button>
                    )}
                    <button title="Rejeitar" onClick={() => setStatus.mutate({ id: p.id, status: "rejected" })}
                      className="rounded-md bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20"><X className="size-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {q.data && q.data.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum repasse pendente.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}