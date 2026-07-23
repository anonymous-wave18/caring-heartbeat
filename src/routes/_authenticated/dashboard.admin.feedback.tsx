import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/admin/feedback")({
  component: FeedbackAdmin,
});

const CATEGORY_LABEL: Record<string, string> = {
  geral: "Geral",
  general: "Geral",
  bug: "Bug",
  ideia: "Ideia",
  reclamacao: "Reclamação",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  resolved: "Resolvido",
  dismissed: "Descartado",
};

function FeedbackAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "dismissed">("open");

  const listQ = useQuery({
    queryKey: ["admin-feedback", filter],
    queryFn: async () => {
      let q = (supabase.from("feedback" as any) as any)
        .select("id, user_id, category, message, status, created_at")
        .order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      const profMap = new Map<string, any>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, discord_username, avatar_url")
          .in("id", ids);
        for (const p of profs ?? []) profMap.set(p.id, p);
      }
      return rows.map((r) => ({ ...r, profile: profMap.get(r.user_id) }));
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase.from("feedback" as any) as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atualizado");
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("feedback" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-primary" /> Feedbacks
        </div>
        <div className="ml-auto flex flex-wrap gap-1 rounded-lg bg-surface p-1 ring-1 ring-border">
          {(["open", "resolved", "dismissed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Todos" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg bg-surface p-8 text-center text-sm text-muted-foreground ring-1 ring-border">
          Nenhum feedback nesta categoria.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const p = r.profile;
            const name =
              `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
              p?.discord_username ||
              (p?.email ? String(p.email).split("@")[0] : "") ||
              "Usuário";
            return (
              <div key={r.id} className="rounded-lg bg-surface p-4 ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p?.email ?? "sem email"} · {new Date(r.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/30">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                        r.status === "open"
                          ? "bg-amber-500/10 text-amber-500 ring-amber-500/30"
                          : r.status === "resolved"
                          ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/30"
                          : "bg-muted text-muted-foreground ring-border"
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground/90">{r.message}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.status !== "resolved" && (
                    <button
                      onClick={() => statusMut.mutate({ id: r.id, status: "resolved" })}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20"
                    >
                      <CheckCircle2 className="size-3.5" /> Marcar resolvido
                    </button>
                  )}
                  {r.status !== "dismissed" && (
                    <button
                      onClick={() => statusMut.mutate({ id: r.id, status: "dismissed" })}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border hover:bg-surface-muted"
                    >
                      <XCircle className="size-3.5" /> Descartar
                    </button>
                  )}
                  {r.status !== "open" && (
                    <button
                      onClick={() => statusMut.mutate({ id: r.id, status: "open" })}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500 ring-1 ring-amber-500/30 hover:bg-amber-500/20"
                    >
                      Reabrir
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm("Remover este feedback definitivamente?")) delMut.mutate(r.id);
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" /> Apagar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}