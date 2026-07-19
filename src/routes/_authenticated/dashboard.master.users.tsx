import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/master/users")({
  component: UsersPage,
});

function UsersPage() {
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["master-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("id, first_name, last_name, email, avatar_url, is_staff, form_status, status, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const rMap = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => { const a = rMap.get(r.user_id) ?? []; a.push(r.role); rMap.set(r.user_id, a); });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: rMap.get(p.id) ?? [] }));
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return query.data ?? [];
    return (query.data ?? []).filter((u: any) => {
      const full = `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email ?? ""}`.toLowerCase();
      return s.split(/\s+/).every((t) => full.includes(t));
    });
  }, [q, query.data]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou email…" className="input w-full pl-9" />
      </div>
      <div className="rounded-xl bg-surface ring-1 ring-border overflow-hidden">
        {query.isLoading && <div className="p-6 text-center"><Loader2 className="inline size-4 animate-spin" /></div>}
        {query.data && <div className="text-xs text-muted-foreground px-4 py-2 border-b border-border">{filtered.length} de {query.data.length} usuários</div>}
        <div className="divide-y divide-border">
          {filtered.map((u: any) => (
            <div key={u.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <div>
                <div className="font-medium">{u.first_name || "—"} {u.last_name || ""}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div className="text-sm">
                <div>Status: <span className="font-medium">{u.status || u.form_status || "—"}</span></div>
                {u.is_staff && <span className="text-xs text-primary">Staff</span>}
              </div>
              <div className="flex flex-wrap gap-1">
                {u.roles.map((r: string) => <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{r}</span>)}
              </div>
              <div className="text-xs text-muted-foreground text-right">{new Date(u.created_at).toLocaleDateString("pt-BR")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
