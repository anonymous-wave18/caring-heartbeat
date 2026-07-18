import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, Pin, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/admin/avisos")({
  component: AdminAvisos,
});

function AdminAvisos() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "members" | "staff">("all");
  const [pinned, setPinned] = useState(false);
  const [notify, setNotify] = useState(true);

  const annQ = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await supabase.from("announcements").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: ann, error } = await supabase.from("announcements").insert({
        title, body, audience, pinned, author_id: u.user!.id,
      }).select().single();
      if (error) throw error;
      if (notify) {
        const audienceFilter = audience === "staff" ? { in: ["admin", "owner"] } : null;
        let userIdsQ = supabase.from("profiles").select("id");
        if (audience === "members") userIdsQ = userIdsQ.eq("status", "approved");
        const { data: profs } = await userIdsQ;
        let targets = (profs ?? []).map((p) => p.id);
        if (audienceFilter) {
          const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", audienceFilter.in as any);
          const set = new Set((roles ?? []).map((r) => r.user_id));
          targets = targets.filter((id) => set.has(id));
        }
        if (targets.length) {
          await supabase.from("notifications").insert(targets.map((user_id) => ({
            user_id, type: "announcement", title: `📣 ${ann.title}`, body: ann.body, link: "/dashboard/avisos",
          })));
        }
      }
    },
    onSuccess: () => {
      toast.success("Anúncio publicado.");
      setTitle(""); setBody(""); setPinned(false);
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("announcements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Removido."); qc.invalidateQueries({ queryKey: ["announcements"] }); },
  });

  const pinMut = useMutation({
    mutationFn: async (a: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("announcements").update({ pinned: !a.pinned }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-3">
        <h2 className="text-lg font-medium">Novo anúncio</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="input" />
        <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Conteúdo" className="input" />
        <div className="grid grid-cols-2 gap-2">
          <select value={audience} onChange={(e) => setAudience(e.target.value as any)} className="input">
            <option value="all">Todos</option>
            <option value="members">Membros aprovados</option>
            <option value="staff">Staff (admins)</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fixar
          </label>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notificar via sistema
        </label>
        <button onClick={() => createMut.mutate()} disabled={!title.trim() || !body.trim() || createMut.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Publicar
        </button>
      </section>

      <section className="space-y-2">
        <div className="text-sm font-medium">Publicados</div>
        <ul className="space-y-2">
          {(annQ.data ?? []).map((a) => (
            <li key={a.id} className="rounded-lg bg-surface p-4 ring-1 ring-border">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.audience} · {new Date(a.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => pinMut.mutate({ id: a.id, pinned: a.pinned })}
                    className={`rounded-md p-1.5 ring-1 ring-border ${a.pinned ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    title="Fixar"><Pin className="size-4" /></button>
                  <button onClick={() => delMut.mutate(a.id)}
                    className="rounded-md p-1.5 ring-1 ring-border text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
            </li>
          ))}
          {annQ.data && annQ.data.length === 0 && <li className="text-sm text-muted-foreground">Nenhum anúncio ainda.</li>}
        </ul>
      </section>
    </div>
  );
}