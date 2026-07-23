import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Check, X, Download, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/useSiteSettings";

export const Route = createFileRoute("/_authenticated/dashboard/admin/pagamentos")({
  component: AdminPagamentos,
});

function AdminPagamentos() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"submitted" | "pending" | "approved" | "overdue" | "all">("all");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const meQ = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user! });
  const myId = meQ.data?.id;

  const paymentsQ = useQuery({
    queryKey: ["admin-payments", filter, scope, myId],
    enabled: !!myId,
    queryFn: async () => {
      let query = supabase.from("payments").select("*");
      if (filter !== "all") query = query.eq("status", filter);
      
      const { data, error } = await query.order("week_start", { ascending: false });
      if (error) throw error;
      
      const payments = (data ?? []) as any[];
      if (payments.length === 0) return [];

      const userIds = Array.from(new Set(payments.map((p) => p.user_id).filter(Boolean)));
      const paymentIds = payments.map((p) => p.id).filter(Boolean);

      const [{ data: profiles, error: profilesError }, { data: proofs, error: proofsError }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, first_name, last_name, email, recruited_by").in("id", userIds)
          : Promise.resolve({ data: [], error: null } as any),
        paymentIds.length
          ? supabase.from("payment_proofs").select("id,payment_id,file_path,file_name,created_at").in("payment_id", paymentIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (profilesError) throw profilesError;
      if (proofsError) throw proofsError;

      const profilesById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const proofsByPayment = new Map<string, any[]>();
      for (const proof of proofs ?? []) {
        const list = proofsByPayment.get(proof.payment_id) ?? [];
        list.push(proof);
        proofsByPayment.set(proof.payment_id, list);
      }

      let rows = payments.map((p) => ({
        ...p,
        profiles: profilesById.get(p.user_id) ?? null,
        payment_proofs: proofsByPayment.get(p.id) ?? [],
      }));
      
      // Filter by "mine" (recruited_by) client-side or we'd need a complex join filter
      if (scope === "mine" && myId) {
        rows = rows.filter(r => r.profiles?.recruited_by === myId || r.recruiter_admin_id === myId);
      }
      
      return rows;
    },
  });

  const reviewMut = useMutation({
    mutationFn: async (args: { id: string; user_id: string; status: "approved" | "pending" }) => {
      const { error } = await supabase.from("payments").update({
        status: args.status,
        approved_at: args.status === "approved" ? new Date().toISOString() : null,
      }).eq("id", args.id);
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: args.user_id, type: "payment",
        title: args.status === "approved" ? "Pagamento aprovado!" : "Pagamento marcado como pendente",
        link: "/dashboard/pagamentos",
      });
    },
    onSuccess: () => { toast.success("Atualizado."); qc.invalidateQueries({ queryKey: ["admin-payments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTransferMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payments").update({
        transfer_status: "pending",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Repasse enviado ao dono para conferência."); qc.invalidateQueries({ queryKey: ["admin-payments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_weekly_payments_all");
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    onSuccess: (n) => {
      toast.success(`Cobranças geradas para ${n} membro(s) aprovado(s).`);
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
    },
    onError: (e: any) => {
      console.error("generate_weekly_payments_all failed:", e);
      toast.error(`Falha: ${e?.message ?? e?.hint ?? "erro desconhecido"}`);
    },
  });

  async function downloadProof(path: string, name: string) {
    const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60);
    if (data?.signedUrl) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.target = "_blank"; a.click(); }
  }

  const filtered = (paymentsQ.data ?? []).filter((p: any) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return `${p.profiles?.first_name ?? ""} ${p.profiles?.last_name ?? ""} ${p.profiles?.email ?? ""}`.toLowerCase().includes(t);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {(["mine","all"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all ${
                scope === s ? "bg-primary text-primary-foreground ring-primary" : "bg-surface ring-border hover:bg-surface-muted"
              }`}>
              {s === "mine" ? "Meus recrutados" : "Todos"}
            </button>
          ))}
          <span className="mx-1 text-muted-foreground">•</span>
          {(["submitted", "pending", "approved", "overdue", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-all ${
                filter === f ? "bg-primary text-primary-foreground ring-primary" : "bg-surface ring-border hover:bg-surface-muted"
              }`}>
              {f === "submitted" ? "Aguardando aprovação" : f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : f === "overdue" ? "Vencidos" : "Todos"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const header = ["Membro", "Email", "Semana", "Vencimento", "Valor", "Status"].join(",");
            const csvRows = filtered.map((p: any) => [
              `"${(p.profiles?.first_name || "")} ${(p.profiles?.last_name || "")}"`.trim(),
              `"${p.profiles?.email || ""}"`,
              `"${p.week_start || ""}"`,
              `"${p.due_date || ""}"`,
              `"${p.amount || 0}"`,
              `"${p.status || ""}"`
            ].join(","));
            const csv = header + "\n" + csvRows.join("\n");
            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `pagamentos_${new Date().toISOString().split('T')[0]}.csv`; a.click();
          }} className="inline-flex items-center gap-1 rounded-md bg-surface px-3 py-2 text-sm font-medium ring-1 ring-border hover:bg-surface-muted">
            <Download className="size-4" /> Exportar CSV
          </button>
          <button onClick={() => generateAll.mutate()} disabled={generateAll.isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Gerar cobrança da semana
          </button>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar membro" className="input pl-9" />
      </div>

      {paymentsQ.isLoading ? <Loader2 className="size-5 animate-spin" /> : (
        <div className="overflow-x-auto rounded-lg bg-surface ring-1 ring-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Membro</th>
                <th className="px-4 py-3">Semana</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Comprovante</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p: any) => {
                const proof = p.payment_proofs?.[0];
                return (
                  <tr key={p.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      {p.profiles?.first_name} {p.profiles?.last_name}
                      <div className="text-xs text-muted-foreground">{p.profiles?.email}</div>
                    </td>
                    <td className="px-4 py-2.5">{p.week_start}</td>
                    <td className="px-4 py-2.5">{p.due_date}</td>
                    <td className="px-4 py-2.5">{formatBRL(p.amount)}</td>
                    <td className="px-4 py-2.5">
                      <div>{p.status}</div>
                      {p.transfer_status && p.transfer_status !== "none" && (
                        <div className="text-[10px] text-muted-foreground">repasse: {p.transfer_status}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {proof ? (
                        <button onClick={() => downloadProof(proof.file_path, proof.file_name)}
                          className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Download className="size-3.5" /> baixar
                        </button>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        {p.status !== "approved" && (
                          <button title="Confirmar recebimento" onClick={() => reviewMut.mutate({ id: p.id, user_id: p.user_id, status: "approved" })}
                            className="rounded-md bg-primary/10 p-1.5 text-primary hover:bg-primary/20"><Check className="size-4" /></button>
                        )}
                        {p.status === "approved" && p.recruiter_admin_id === myId && (p.transfer_status === "none" || !p.transfer_status) && (
                          <button title="Enviei o PIX ao dono" onClick={() => sendTransferMut.mutate(p.id)}
                            className="rounded-md bg-amber-500/10 p-1.5 text-amber-500 hover:bg-amber-500/20"><Send className="size-4" /></button>
                        )}
                        {p.status === "approved" && (
                          <button title="Marcar como pendente" onClick={() => reviewMut.mutate({ id: p.id, user_id: p.user_id, status: "pending" })}
                            className="rounded-md bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20"><X className="size-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sem registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}