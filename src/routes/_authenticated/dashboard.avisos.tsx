import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Bell, Megaphone, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/avisos")({
  component: AvisosPage,
});

function AvisosPage() {
  const qc = useQueryClient();
  const userQ = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user! });
  const userId = userQ.data?.id;

  const annQ = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const notifQ = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", userId!).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() })
        .eq("user_id", userId!).is("read_at", null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    },
  });

  useEffect(() => {
    if (!userId) return;
    if ((notifQ.data ?? []).some((n) => !n.read_at)) {
      markAll.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, notifQ.data]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-medium tracking-tight">Avisos & Notificações</h1>
      </header>

      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Megaphone className="size-4" /> Anúncios</div>
        <ul className="space-y-3">
          {(annQ.data ?? []).map((a) => (
            <li key={a.id} className={`rounded-lg p-4 ring-1 ${a.pinned ? "bg-primary/5 ring-primary/30" : "bg-surface ring-border"}`}>
              <div className="flex items-center gap-2">
                {a.pinned && <Pin className="size-3.5 text-primary" />}
                <h3 className="font-medium">{a.title}</h3>
                <span className="ml-auto text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
            </li>
          ))}
          {annQ.data && annQ.data.length === 0 && <li className="text-sm text-muted-foreground">Nenhum anúncio.</li>}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Bell className="size-4" /> Suas notificações</div>
        <ul className="divide-y divide-border rounded-lg bg-surface ring-1 ring-border">
          {(notifQ.data ?? []).map((n) => (
            <li key={n.id} className="p-4 text-sm">
              <div className="font-medium">{n.title}</div>
              {n.body && <div className="mt-0.5 text-muted-foreground">{n.body}</div>}
              <div className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
            </li>
          ))}
          {notifQ.data && notifQ.data.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sem notificações.</li>}
        </ul>
      </section>
    </div>
  );
}